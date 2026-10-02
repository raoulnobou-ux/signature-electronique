import { beforeAll, describe, expect, it } from "vitest";
import { admin, hasLocalDb, userClient } from "./setup";

/**
 * Vérifie les règles de sécurité de la base (Row Level Security) avec de vrais comptes :
 * cloisonnement entre utilisateurs, colonnes protégées, tables en écriture serveur seule.
 */
describe.skipIf(!hasLocalDb)("sécurité des données (RLS)", () => {
  let alice: Awaited<ReturnType<typeof userClient>>;
  let bob: Awaited<ReturnType<typeof userClient>>;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([userClient("alice"), userClient("bob")]);
  });

  it("l'inscription crée un profil et un essai de 6 jours", async () => {
    const { data } = await alice.client.from("subscriptions").select("*").single();
    expect(data?.plan).toBe("trial");
    expect(data?.status).toBe("trialing");
    const days =
      (new Date(data!.current_period_end).getTime() -
        new Date(data!.current_period_start).getTime()) /
      86_400_000;
    expect(Math.round(days)).toBe(6);
  });

  it("un utilisateur ne voit jamais le profil ni l'abonnement d'un autre", async () => {
    const profiles = await alice.client.from("profiles").select("id");
    expect(profiles.data?.map((p) => p.id)).toEqual([alice.id]);
    const other = await alice.client.from("subscriptions").select("*").eq("user_id", bob.id);
    expect(other.data).toEqual([]);
  });

  it("impossible de prolonger soi-même son essai ou de modifier son abonnement", async () => {
    const trial = await alice.client
      .from("profiles")
      .update({ trial_ends_at: "2099-01-01T00:00:00Z" } as never)
      .eq("id", alice.id);
    expect(trial.error).not.toBeNull();

    await alice.client
      .from("subscriptions")
      .update({ plan: "pro", status: "active" })
      .eq("user_id", alice.id);
    const { data } = await admin()
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", alice.id)
      .single();
    expect(data).toEqual({ plan: "trial", status: "trialing" });
  });

  it("le journal d'audit n'accepte aucune écriture depuis le navigateur et reste immuable", async () => {
    const insert = await alice.client
      .from("audit_events")
      .insert({ actor_type: "user", actor_id: alice.id, event_type: "fake" });
    expect(insert.error).not.toBeNull();

    const { data: row } = await admin()
      .from("audit_events")
      .insert({ actor_type: "system", event_type: "test.immutable" })
      .select("id")
      .single();
    const update = await admin()
      .from("audit_events")
      .update({ event_type: "tampered" })
      .eq("id", row!.id);
    // Même le rôle serveur est refusé : droits retirés, et déclencheur « ajout seul » derrière.
    expect(update.error?.message).toMatch(/permission denied|ajout seul/);
    const del = await admin().from("audit_events").delete().eq("id", row!.id);
    expect(del.error?.message).toMatch(/permission denied|ajout seul/);
    const { data: kept } = await admin()
      .from("audit_events")
      .select("event_type")
      .eq("id", row!.id)
      .single();
    expect(kept?.event_type).toBe("test.immutable");
  });

  it("un compte expiré ne peut plus créer de document, même via l'API", async () => {
    await admin()
      .from("subscriptions")
      .update({ current_period_end: new Date(Date.now() - 1000).toISOString() })
      .eq("user_id", bob.id);
    const { error } = await bob.client.from("documents").insert({
      owner_id: bob.id,
      title: "Contrat",
      original_path: `${bob.id}/x.pdf`,
      original_type: "pdf",
      original_name: "x.pdf",
    });
    expect(error).not.toBeNull();
  });

  it("un utilisateur ne peut pas créer de document au nom d'un autre", async () => {
    const { error } = await alice.client.from("documents").insert({
      owner_id: bob.id,
      title: "Usurpation",
      original_path: `${bob.id}/y.pdf`,
      original_type: "pdf",
      original_name: "y.pdf",
    });
    expect(error).not.toBeNull();
  });

  it("le statut et l'empreinte d'un document ne sont modifiables que par le serveur", async () => {
    const { data: doc } = await alice.client
      .from("documents")
      .insert({
        owner_id: alice.id,
        title: "Lettre",
        original_path: `${alice.id}/l.pdf`,
        original_type: "pdf",
        original_name: "l.pdf",
      })
      .select("id")
      .single();
    expect(doc?.id).toBeTruthy();

    const forged = await alice.client
      .from("documents")
      .update({ status: "signed", sha256: "0".repeat(64) } as never)
      .eq("id", doc!.id);
    expect(forged.error).not.toBeNull();

    const renamed = await alice.client
      .from("documents")
      .update({ title: "Lettre renommée" })
      .eq("id", doc!.id);
    expect(renamed.error).toBeNull();

    const seenByBob = await bob.client.from("documents").select("id").eq("id", doc!.id);
    expect(seenByBob.data).toEqual([]);
  });

  it("les compteurs d'usage et les tarifs ne sont pas modifiables par l'utilisateur", async () => {
    const usage = await alice.client
      .from("usage_counters")
      .insert({ user_id: alice.id, day: "2026-01-01", documents_signed: -100 });
    expect(usage.error).not.toBeNull();
    await alice.client.from("plans_config").update({ monthly_price: 1 }).eq("plan", "pro");
    const { data } = await admin()
      .from("plans_config")
      .select("monthly_price")
      .eq("plan", "pro")
      .eq("currency", "XAF")
      .single();
    expect(data?.monthly_price).toBe(15000);
  });

  it("la limitation de débit n'est pas appelable depuis le navigateur", async () => {
    const { error } = await alice.client.rpc("check_rate_limit", {
      p_bucket: "x",
      p_max: 1,
      p_window: "1 hour",
    });
    expect(error).not.toBeNull();
  });
});

describe.skipIf(!hasLocalDb)("journal d'audit et suppression", () => {
  it("supprimer un document conserve son historique d'audit", async () => {
    const owner = await userClient("carol");
    const { data: doc } = await owner.client
      .from("documents")
      .insert({
        owner_id: owner.id,
        title: "À supprimer",
        original_path: `${owner.id}/d.pdf`,
        original_type: "pdf",
        original_name: "d.pdf",
      })
      .select("id")
      .single();
    await admin().from("audit_events").insert({
      document_id: doc!.id,
      actor_type: "user",
      actor_id: owner.id,
      event_type: "document.imported",
    });
    await owner.client
      .from("documents")
      .update({ trashed_at: new Date().toISOString() })
      .eq("id", doc!.id);
    const { error } = await owner.client.from("documents").delete().eq("id", doc!.id);
    expect(error).toBeNull();
    const { data: events } = await admin()
      .from("audit_events")
      .select("event_type")
      .eq("document_id", doc!.id);
    expect(events).toEqual([{ event_type: "document.imported" }]);
  });
});
