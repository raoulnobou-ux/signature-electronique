import { admin, hasLocalDb, userClient } from "./setup";
import { describe, expect, it } from "vitest";

describe.skipIf(!hasLocalDb)("assistant : isolation des conversations (base réelle)", () => {
  it("chacun ne voit que ses conversations ; écriture réservée au serveur ; cache FAQ privé", async () => {
    const awa = await userClient("ia-awa");
    const paul = await userClient("ia-paul");
    const { data: conversation } = await admin()
      .from("ai_conversations")
      .insert({ user_id: awa.id, title: "Mon bail" })
      .select("id")
      .single();
    await admin()
      .from("ai_messages")
      .insert({
        conversation_id: conversation!.id,
        role: "user",
        content: [{ type: "text", text: "Résume mon bail" }],
      });
    await admin()
      .from("ai_faq_cache")
      .upsert({ key: `test:${awa.id}`, answer: "réponse" });

    const mine = await awa.client
      .from("ai_messages")
      .select("id")
      .eq("conversation_id", conversation!.id);
    expect(mine.data).toHaveLength(1);
    const theirs = await paul.client
      .from("ai_messages")
      .select("id")
      .eq("conversation_id", conversation!.id);
    expect(theirs.data).toEqual([]);
    expect((await paul.client.from("ai_conversations").select("id")).data).toEqual([]);

    // Pas d'écriture directe : l'historique n'est écrit que par l'API (quota, contrôle).
    const forged = await awa.client
      .from("ai_messages")
      .insert({
        conversation_id: conversation!.id,
        role: "assistant",
        content: [{ type: "text", text: "faux" }],
      });
    expect(forged.error).not.toBeNull();
    expect((await awa.client.from("ai_faq_cache").select("key")).data).toEqual([]);

    // Suppression par un autre utilisateur : sans effet ; par la propriétaire : effective.
    await paul.client.from("ai_conversations").delete().eq("id", conversation!.id);
    expect(
      (await admin().from("ai_conversations").select("id").eq("id", conversation!.id)).data,
    ).toHaveLength(1);
    await awa.client.from("ai_conversations").delete().eq("id", conversation!.id);
    expect(
      (await admin().from("ai_messages").select("id").eq("conversation_id", conversation!.id)).data,
    ).toEqual([]);
    await admin().from("ai_faq_cache").delete().eq("key", `test:${awa.id}`);
  });
});
