import { admin, hasLocalDb, userClient } from "./setup";
import { describe, expect, it } from "vitest";

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe.skipIf(!hasLocalDb)("équipe, partage et demandes (base réelle)", () => {
  it("un membre profite du plan Pro du propriétaire, et le perd en quittant l'équipe", async () => {
    const owner = await userClient("eq-owner");
    const member = await userClient("eq-member");
    await admin().from("subscriptions").update({ plan: "pro", status: "active", current_period_end: iso(20) }).eq("user_id", owner.id);
    await admin().from("subscriptions").update({ status: "expired", current_period_end: iso(-5) }).eq("user_id", member.id);
    const canWrite = async () => (await admin().rpc("can_write", { p_user_id: member.id })).data;
    expect(await canWrite()).toBe(false);

    const { data: team } = await admin().from("teams").insert({ owner_id: owner.id, name: "Cabinet" }).select("id").single();
    await admin().from("team_members").insert([
      { team_id: team!.id, user_id: owner.id, role: "owner" },
      { team_id: team!.id, user_id: member.id, role: "member" },
    ]);
    expect(await canWrite()).toBe(true);
    const { data: sponsor } = await member.client.rpc("my_team_sponsor");
    expect(sponsor?.[0]).toMatchObject({ team_name: "Cabinet", plan: "pro" });

    // Propriétaire rétrogradé en Essentiel : plus de parrainage Pro.
    await admin().from("subscriptions").update({ plan: "essential" }).eq("user_id", owner.id);
    expect(await canWrite()).toBe(false);
    await admin().from("subscriptions").update({ plan: "pro" }).eq("user_id", owner.id);

    await admin().from("team_members").delete().eq("user_id", member.id);
    expect(await canWrite()).toBe(false);
  });

  it("partage : modèles et cachets visibles des seuls membres ; gestion de l'équipe réservée au serveur", async () => {
    const owner = await userClient("pa-owner");
    const member = await userClient("pa-member");
    const outsider = await userClient("pa-out");
    const { data: team } = await admin().from("teams").insert({ owner_id: owner.id, name: "Équipe" }).select("id").single();
    await admin().from("team_members").insert([
      { team_id: team!.id, user_id: owner.id, role: "owner" },
      { team_id: team!.id, user_id: member.id, role: "member" },
    ]);
    const { data: tpl } = await admin()
      .from("templates")
      .insert({ owner_id: owner.id, name: "Bail", team_id: team!.id })
      .select("id")
      .single();
    expect((await member.client.from("templates").select("id").eq("id", tpl!.id)).data).toHaveLength(1);
    expect((await outsider.client.from("templates").select("id").eq("id", tpl!.id)).data).toHaveLength(0);

    // Un membre ne peut ni modifier le modèle d'un autre, ni s'ajouter lui-même à une équipe.
    await member.client.from("templates").update({ name: "Piraté" }).eq("id", tpl!.id);
    expect((await admin().from("templates").select("name").eq("id", tpl!.id).single()).data!.name).toBe("Bail");
    const join = await outsider.client.from("team_members").insert({ team_id: team!.id, user_id: outsider.id, role: "admin" });
    expect(join.error).not.toBeNull();

    // Invitations : lisibles par les administrateurs uniquement.
    await admin().from("team_invitations").insert({ team_id: team!.id, email: "x@example.com", role: "member", token_hash: `h-${Date.now()}`, expires_at: iso(7) });
    expect((await owner.client.from("team_invitations").select("id")).data!.length).toBeGreaterThan(0);
    expect((await member.client.from("team_invitations").select("id")).data).toEqual([]);

    // Partage vers une équipe dont on n'est pas membre : refusé.
    const { data: asset } = await admin()
      .from("signature_assets")
      .insert({ owner_id: outsider.id, type: "stamp", name: "Cachet", method: "generated", image_path: "x.png" })
      .select("id")
      .single();
    await outsider.client.from("signature_assets").update({ team_id: team!.id }).eq("id", asset!.id);
    expect((await admin().from("signature_assets").select("team_id").eq("id", asset!.id).single()).data!.team_id).toBeNull();

    // Une personne n'appartient qu'à une seule équipe.
    const { data: other } = await admin().from("teams").insert({ owner_id: outsider.id, name: "Autre" }).select("id").single();
    const second = await admin().from("team_members").insert({ team_id: other!.id, user_id: member.id, role: "member" });
    expect(second.error?.code).toBe("23505");
  });

  it("les zones d'une demande envoyée ne sont pas modifiables par le propriétaire", async () => {
    const owner = await userClient("zones");
    const { data: doc } = await admin()
      .from("documents")
      .insert({ owner_id: owner.id, title: "Contrat", original_path: "p", original_type: "pdf", original_name: "c.pdf", pdf_path: "p", page_count: 1 })
      .select("id")
      .single();
    const { data: request } = await admin()
      .from("signature_requests")
      .insert({ document_id: doc!.id, owner_id: owner.id, mode: "parallel", status: "pending" })
      .select("id")
      .single();
    const { data: signer } = await admin()
      .from("request_signers")
      .insert({ request_id: request!.id, name: "Awa", email: "a@example.com", token_hash: `t-${Date.now()}` })
      .select("id")
      .single();
    const insert = await owner.client.from("placed_fields").insert({
      document_id: doc!.id,
      request_signer_id: signer!.id,
      page: 0,
      x_pct: 1,
      y_pct: 1,
      w_pct: 10,
      h_pct: 5,
      type: "signature",
    });
    expect(insert.error).not.toBeNull();
    // Le brouillon personnel (sans signataire) reste autorisé.
    const draft = await owner.client.from("placed_fields").insert({ document_id: doc!.id, page: 0, x_pct: 1, y_pct: 1, w_pct: 10, h_pct: 5, type: "date", value: "x" });
    expect(draft.error).toBeNull();
    // Signataires et demandes : lecture par le propriétaire uniquement.
    expect((await owner.client.from("request_signers").select("id")).data).toHaveLength(1);
  });
});
