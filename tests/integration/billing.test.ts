import { admin, hasLocalDb, userClient } from "./setup";
import { describe, expect, it } from "vitest";
import { runBillingCron } from "@/lib/billing/service";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function payment(
  userId: string,
  values: { plan: "essential" | "pro"; cycle: "monthly" | "yearly"; kind: "new" | "renewal" | "upgrade"; amount: number },
) {
  const { data, error } = await admin()
    .from("payments")
    .insert({
      user_id: userId,
      provider: "sandbox",
      provider_ref: `QS-test-${crypto.randomUUID()}`,
      amount: values.amount,
      currency: "XAF",
      status: "pending",
      plan: values.plan,
      billing_cycle: values.cycle,
      kind: values.kind,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const complete = (id: string) =>
  admin().rpc("complete_payment", { p_payment_id: id, p_provider_tx_id: "tx-1", p_method: "mobilemoney_mtn" });

async function subscription(userId: string) {
  const { data } = await admin().from("subscriptions").select("*").eq("user_id", userId).single();
  return data!;
}

const setSubscription = (userId: string, values: TablesUpdate<"subscriptions">) =>
  admin().from("subscriptions").update(values).eq("user_id", userId);

describe.skipIf(!hasLocalDb)("paiements et abonnements (base réelle)", () => {
  it("pendant l'essai : période payée enchaînée après l'essai, jours d'essai conservés, idempotent", async () => {
    const { id } = await userClient("essai-paye");
    const before = await subscription(id);
    const pay = await payment(id, { plan: "essential", cycle: "monthly", kind: "new", amount: 5000 });

    const first = await complete(pay);
    expect(first.error).toBeNull();
    expect(first.data![0]).toMatchObject({ applied: true });
    expect(first.data![0]!.receipt_number).toMatch(/^QS-\d{4}-\d{6}$/);

    const after = await subscription(id);
    expect(after).toMatchObject({ status: "active", plan: "trial", scheduled_plan: "essential" });
    expect(new Date(after.scheduled_plan_at!).getTime()).toBe(new Date(before.current_period_end).getTime());
    const end = new Date(before.current_period_end);
    end.setMonth(end.getMonth() + 1);
    expect(Math.abs(new Date(after.current_period_end).getTime() - end.getTime())).toBeLessThan(2 * 3600_000);

    const second = await complete(pay);
    expect(second.data![0]).toMatchObject({ applied: false, receipt_number: first.data![0]!.receipt_number });
    expect(new Date((await subscription(id)).current_period_end).getTime()).toBe(new Date(after.current_period_end).getTime());
  });

  it("compte expiré : réactivation immédiate, période démarrant maintenant", async () => {
    const { id } = await userClient("reactivation");
    await setSubscription(id, { status: "expired", current_period_end: iso(-10 * DAY) });
    const pay = await payment(id, { plan: "pro", cycle: "yearly", kind: "new", amount: 150000 });
    await complete(pay);
    const sub = await subscription(id);
    expect(sub).toMatchObject({ plan: "pro", status: "active", billing_cycle: "yearly", scheduled_plan: null });
    const days = (new Date(sub.current_period_end).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(367);
  });

  it("Essentiel → Pro au prorata : Pro immédiat, même date de fin", async () => {
    const { id } = await userClient("upgrade");
    const end = iso(20 * DAY);
    await setSubscription(id, { plan: "essential", status: "active", billing_cycle: "monthly", currency: "XAF", current_period_start: iso(-10 * DAY), current_period_end: end });
    await complete(await payment(id, { plan: "pro", cycle: "monthly", kind: "upgrade", amount: 6670 }));
    const sub = await subscription(id);
    expect(sub.plan).toBe("pro");
    expect(new Date(sub.current_period_end).getTime()).toBe(new Date(end).getTime());
  });

  it("renouvellement anticipé : la période s'ajoute à la fin de l'actuelle", async () => {
    const { id } = await userClient("renouvellement");
    const start = iso(-25 * DAY);
    await setSubscription(id, { plan: "essential", status: "active", billing_cycle: "monthly", currency: "XAF", current_period_start: start, current_period_end: iso(5 * DAY) });
    const before = await subscription(id);
    await complete(await payment(id, { plan: "essential", cycle: "monthly", kind: "renewal", amount: 5000 }));
    const sub = await subscription(id);
    const expected = new Date(before.current_period_end);
    expected.setMonth(expected.getMonth() + 1);
    expect(new Date(sub.current_period_end).getTime()).toBe(expected.getTime());
    expect(new Date(sub.current_period_start).getTime()).toBe(new Date(before.current_period_start).getTime());
  });

  it("écriture autorisée : grâce de 3 jours, mais pas après une annulation", async () => {
    const { id } = await userClient("grace");
    const canWrite = async () => (await admin().rpc("can_write", { p_user_id: id })).data;
    await setSubscription(id, { plan: "essential", status: "active", current_period_end: iso(-DAY) });
    expect(await canWrite()).toBe(true);
    await setSubscription(id, { status: "past_due", current_period_end: iso(-4 * DAY) });
    expect(await canWrite()).toBe(false);
    await setSubscription(id, { status: "active", cancel_at_period_end: true, current_period_end: iso(-3600_000) });
    expect(await canWrite()).toBe(false);
    await setSubscription(id, { current_period_end: iso(DAY) });
    expect(await canWrite()).toBe(true);
  });

  it("un utilisateur voit ses paiements mais ni les journaux ni les paiements des autres, et n'écrit rien", async () => {
    const alice = await userClient("paie-alice");
    const bob = await userClient("paie-bob");
    await payment(alice.id, { plan: "pro", cycle: "monthly", kind: "new", amount: 15000 });
    expect((await alice.client.from("payments").select("id")).data).toHaveLength(1);
    expect((await bob.client.from("payments").select("id")).data).toHaveLength(0);
    expect((await alice.client.from("billing_notices").select("*")).data).toEqual([]);
    expect((await alice.client.from("payment_events").select("*")).data).toEqual([]);
    const insert = await alice.client.from("payments").insert({
      user_id: alice.id,
      provider: "sandbox",
      provider_ref: "QS-forge",
      amount: 1,
      currency: "XAF",
      status: "successful",
      plan: "pro",
      billing_cycle: "yearly",
    });
    expect(insert.error).not.toBeNull();
    const rpc = await alice.client.rpc("complete_payment", { p_payment_id: crypto.randomUUID(), p_provider_tx_id: "x", p_method: "x" });
    expect(rpc.error).not.toBeNull();
  });

  it("tâche quotidienne : grâce, lecture seule, fin d'essai — sans doublon d'e-mail", async () => {
    const lapsed = await userClient("cron-grace");
    const overdue = await userClient("cron-expire");
    const trial = await userClient("cron-essai");
    const canceled = await userClient("cron-annule");
    await setSubscription(lapsed.id, { plan: "essential", status: "active", current_period_end: iso(-3600_000) });
    await setSubscription(overdue.id, { plan: "pro", status: "past_due", current_period_end: iso(-4 * DAY) });
    await setSubscription(trial.id, { current_period_end: iso(-60_000) });
    await setSubscription(canceled.id, { plan: "pro", status: "active", cancel_at_period_end: true, current_period_end: iso(-60_000) });

    await runBillingCron();
    expect((await subscription(lapsed.id)).status).toBe("past_due");
    expect((await subscription(overdue.id)).status).toBe("expired");
    expect((await subscription(trial.id)).status).toBe("expired");
    expect((await subscription(canceled.id)).status).toBe("expired");

    const notices = async () =>
      (await admin().from("billing_notices").select("user_id, kind").in("user_id", [lapsed.id, overdue.id, trial.id, canceled.id])).data ?? [];
    const first = await notices();
    expect(first.map((n) => n.kind).sort()).toEqual(["expired", "expired", "grace", "trial_ended"]);
    await runBillingCron();
    expect(await notices()).toHaveLength(first.length);
  });
});
