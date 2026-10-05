import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { admin, hasLocalDb, url, userClient } from "./setup";

/**
 * Tests de sécurité (audit d'octobre 2026) : un utilisateur A tente d'accéder aux données
 * d'un utilisateur B par tous les chemins possibles, avec de vrais comptes et la vraie
 * base (RLS, privilèges, stockage). Chaque tentative doit échouer.
 */
describe.skipIf(!hasLocalDb)("sécurité : isolement entre utilisateurs", () => {
  let a: Awaited<ReturnType<typeof userClient>>;
  let b: Awaited<ReturnType<typeof userClient>>;
  let docB: string;
  let fileB: string;
  let sigB: string;
  let sigFileB: string;
  let folderB: string;
  let docA: string;
  const anon = () =>
    createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
      auth: { persistSession: false },
    });

  beforeAll(async () => {
    [a, b] = await Promise.all([userClient("sec-a"), userClient("sec-b")]);
    const db = admin();
    docB = randomUUID();
    fileB = `${b.id}/${docB}/document.pdf`;
    await db.storage
      .from("documents")
      .upload(fileB, new Blob(["%PDF-1.4 secret de B"]), { contentType: "application/pdf" });
    await db.from("documents").insert({
      id: docB,
      owner_id: b.id,
      title: "Contrat confidentiel de B",
      original_path: fileB,
      original_type: "pdf",
      original_name: "contrat.pdf",
      pdf_path: fileB,
    });
    sigFileB = `${b.id}/signature-b.png`;
    await db.storage
      .from("signatures")
      .upload(sigFileB, new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]), {
        contentType: "image/png",
      });
    const { data: sig } = await db
      .from("signature_assets")
      .insert({
        owner_id: b.id,
        type: "signature",
        name: "Signature de B",
        method: "draw",
        image_path: sigFileB,
        width: 10,
        height: 5,
      })
      .select("id")
      .single();
    sigB = sig!.id;
    const { data: folder } = await db
      .from("folders")
      .insert({ owner_id: b.id, name: "Dossier de B" })
      .select("id")
      .single();
    folderB = folder!.id;
    docA = randomUUID();
    await db.from("documents").insert({
      id: docA,
      owner_id: a.id,
      title: "Document de A",
      original_path: `${a.id}/${docA}/document.pdf`,
      original_type: "pdf",
      original_name: "a.pdf",
    });
  });

  it("1. A ne lit pas le document de B, même avec son identifiant", async () => {
    const { data } = await a.client.from("documents").select("*").eq("id", docB);
    expect(data).toEqual([]);
    const { data: versions } = await a.client
      .from("document_versions")
      .select("*")
      .eq("document_id", docB);
    expect(versions).toEqual([]);
    const { data: audit } = await a.client.from("audit_events").select("*").eq("document_id", docB);
    expect(audit).toEqual([]);
  });

  it("2. A ne modifie ni ne supprime le document de B en changeant l'identifiant", async () => {
    const { data: renamed } = await a.client
      .from("documents")
      .update({ title: "piraté" })
      .eq("id", docB)
      .select("id");
    expect(renamed ?? []).toEqual([]);
    await a.client.from("documents").delete().eq("id", docB);
    const placed = await a.client.from("placed_fields").insert({
      document_id: docB,
      page: 0,
      x_pct: 1,
      y_pct: 1,
      w_pct: 10,
      h_pct: 5,
      type: "text",
    });
    expect(placed.error).not.toBeNull();
    const { data: still } = await admin().from("documents").select("title").eq("id", docB).single();
    expect(still!.title).toBe("Contrat confidentiel de B");
  });

  it("3. un visiteur non connecté ne lit aucune donnée ni aucun fichier", async () => {
    const visitor = anon();
    for (const table of [
      "documents",
      "profiles",
      "signature_assets",
      "payments",
      "subscriptions",
      "audit_events",
    ] as const) {
      const { data } = await visitor.from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
    const file = await visitor.storage.from("documents").download(fileB);
    expect(file.data).toBeNull();
    // Seuls les tarifs sont publics.
    const { data: prices } = await visitor.from("plans_config").select("plan").limit(1);
    expect(prices?.length).toBe(1);
  });

  it("4. un document à la corbeille n'est plus visible des membres de l'équipe", async () => {
    const db = admin();
    const { data: team } = await db
      .from("teams")
      .insert({ owner_id: b.id, name: "Équipe B" })
      .select("id")
      .single();
    await db.from("team_members").insert([
      { team_id: team!.id, user_id: b.id, role: "owner" },
      { team_id: team!.id, user_id: a.id, role: "member" },
    ]);
    const shared = randomUUID();
    await db.from("documents").insert({
      id: shared,
      owner_id: b.id,
      team_id: team!.id,
      title: "Partagé",
      original_path: `${b.id}/${shared}/document.pdf`,
      original_type: "pdf",
      original_name: "p.pdf",
    });
    expect((await a.client.from("documents").select("id").eq("id", shared)).data).toHaveLength(1);
    await db.from("documents").update({ trashed_at: new Date().toISOString() }).eq("id", shared);
    expect((await a.client.from("documents").select("id").eq("id", shared)).data).toEqual([]);
    // Le propriétaire, lui, le voit toujours (pour le restaurer).
    expect((await b.client.from("documents").select("id").eq("id", shared)).data).toHaveLength(1);
    await db.from("team_members").delete().eq("team_id", team!.id);
    await db.from("teams").delete().eq("id", team!.id);
  });

  it("5. une URL signée expirée ne donne plus accès au fichier", async () => {
    const { data } = await admin().storage.from("documents").createSignedUrl(fileB, 1);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const response = await fetch(data!.signedUrl);
    expect(response.ok).toBe(false);
  });

  it("6. aucun paiement ni abonnement ne s'écrit depuis le navigateur", async () => {
    const forged = await a.client.from("payments").insert({
      user_id: a.id,
      provider: "sandbox",
      provider_ref: `forge-${Date.now()}`,
      amount: 1,
      currency: "XAF",
      status: "successful",
      plan: "pro",
      billing_cycle: "yearly",
      kind: "new",
    });
    expect(forged.error).not.toBeNull();
    const upgrade = await a.client
      .from("subscriptions")
      .update({ plan: "pro", status: "active" })
      .eq("user_id", a.id);
    expect(upgrade.error).not.toBeNull();
    const rpc = await a.client.rpc(
      "complete_payment" as never,
      {
        p_payment_id: randomUUID(),
        p_provider_tx_id: "x",
        p_method: "card",
      } as never,
    );
    expect(rpc.error).not.toBeNull();
  });

  it("7. changer le user_id côté client ne donne aucun droit", async () => {
    const asB = await a.client.from("signature_assets").insert({
      owner_id: b.id,
      type: "signature",
      name: "usurpée",
      method: "draw",
      image_path: `${b.id}/x.png`,
    });
    expect(asB.error).not.toBeNull();
    const folder = await a.client.from("folders").insert({ owner_id: b.id, name: "intrus" });
    expect(folder.error).not.toBeNull();
    const profile = await a.client
      .from("profiles")
      .update({ full_name: "piraté" })
      .eq("id", b.id)
      .select("id");
    expect(profile.data ?? []).toEqual([]);
  });

  it("8. A ne range pas son document dans un dossier de B", async () => {
    const moved = await a.client.from("documents").update({ folder_id: folderB }).eq("id", docA);
    expect(moved.error).not.toBeNull();
    const sub = await a.client.from("folders").insert({
      owner_id: a.id,
      name: "sous-dossier",
      parent_id: folderB,
    });
    expect(sub.error).not.toBeNull();
  });

  it("9. traversée de chemin dans le stockage : refusée", async () => {
    for (const path of [
      `${a.id}/../${b.id}/${docB}/document.pdf`,
      `${b.id}/${docB}/document.pdf`,
      `../${b.id}/${docB}/document.pdf`,
    ]) {
      const { data } = await a.client.storage.from("documents").download(path);
      expect(data).toBeNull();
    }
    const listing = await a.client.storage.from("documents").list(b.id);
    expect(listing.data ?? []).toEqual([]);
  });

  it("10. A n'accède ni aux signatures ni aux cachets de B", async () => {
    const { data } = await a.client.from("signature_assets").select("*").eq("id", sigB);
    expect(data).toEqual([]);
    const file = await a.client.storage.from("signatures").download(sigFileB);
    expect(file.data).toBeNull();
    await a.client.from("signature_assets").delete().eq("id", sigB);
    const { data: kept } = await admin().from("signature_assets").select("id").eq("id", sigB);
    expect(kept).toHaveLength(1);
  });

  it("les sessions listées sont uniquement celles de l'utilisateur", async () => {
    const { data, error } = await a.client.rpc("my_sessions");
    expect(error).toBeNull();
    const ids = new Set((data ?? []).map((s) => s.id));
    const { data: bSessions } = await b.client.rpc("my_sessions");
    for (const s of bSessions ?? []) expect(ids.has(s.id)).toBe(false);
    expect((data ?? []).some((s) => s.current)).toBe(true);
  });

  it("les tables écrites par le serveur seul refusent toute écriture du navigateur", async () => {
    for (const [table, row] of [
      ["audit_events", { actor_type: "user", event_type: "forge" }],
      ["document_versions", { document_id: docA, version: 9, file_path: "x", sha256: "0" }],
      ["usage_counters", { user_id: a.id, day: "2026-01-01" }],
      ["team_members", { team_id: randomUUID(), user_id: a.id, role: "owner" }],
    ] as const) {
      const { error } = await a.client.from(table).insert(row as never);
      expect(error, table).not.toBeNull();
    }
  });
});
