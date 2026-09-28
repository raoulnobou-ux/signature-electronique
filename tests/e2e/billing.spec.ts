import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { adminClient, createConfirmedUser, signInAs } from "./helpers/accounts";

const DAY = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

async function setSubscription(userId: string, values: Record<string, unknown>) {
  const { error } = await adminClient().from("subscriptions").update(values).eq("user_id", userId);
  if (error) throw error;
}

/** Choisit un plan (cycle mensuel, FCFA) et ouvre le récapitulatif. */
async function choosePlan(page: Page, buttonName: string | RegExp) {
  await page.goto("/app/abonnement");
  await page.getByRole("radio", { name: "FCFA" }).click();
  await page.getByRole("button", { name: buttonName }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("checkout-amount")).toBeVisible({ timeout: 10_000 });
}

async function payInSandbox(page: Page, method: "MTN Mobile Money" | "Orange Money" | "Carte bancaire", succeed = true) {
  await page.getByRole("dialog").getByRole("button", { name: /^Payer/ }).click();
  await page.waitForURL(/\/paiement-test\?ref=QS-/);
  await page.getByRole("radio", { name: method }).click();
  await page.getByRole("button", { name: succeed ? /^Payer/ : "Simuler un échec" }).click();
  await page.waitForURL(/\/app\/abonnement\?paiement=/);
}

test("essai → Essentiel payé par Mobile Money → reçu PDF, jours d'essai conservés", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const user = await createConfirmedUser("paie-essai");
  await signInAs(page, user.email);
  const { data: before } = await adminClient().from("subscriptions").select("current_period_end").eq("user_id", user.id).single();

  await choosePlan(page, "Choisir Essentiel");
  await expect(page.getByTestId("checkout-amount")).toHaveText(/5\s000\sFCFA/);
  await expect(page.getByRole("dialog")).toContainText("vos jours restants sont conservés");
  await payInSandbox(page, "MTN Mobile Money");

  await expect(page).toHaveURL(/paiement=succes/);
  await expect(page.getByText("Paiement confirmé")).toBeVisible();
  const history = page.getByTestId("payment-history");
  await expect(history).toContainText("Abonnement Essentiel — mensuel");
  await expect(history).toContainText("Payé");

  const { data: sub } = await adminClient().from("subscriptions").select("*").eq("user_id", user.id).single();
  expect(sub).toMatchObject({ status: "active", plan: "trial", scheduled_plan: "essential", currency: "XAF" });
  expect(sub.scheduled_plan_at).toBe(before!.current_period_end);
  const { data: payments } = await adminClient().from("payments").select("status, receipt_path, payment_method").eq("user_id", user.id);
  expect(payments).toMatchObject([{ status: "successful", payment_method: "mobilemoney_mtn" }]);
  expect(payments![0]!.receipt_path).toMatch(/\.pdf$/);

  // Reçu téléchargeable
  const download = page.waitForEvent("download");
  await history.getByRole("button", { name: /Reçu/ }).click();
  const file = await (await download).path();
  const { readFile } = await import("node:fs/promises");
  const pdf = await PDFDocument.load(await readFile(file), { updateMetadata: false });
  expect(pdf.getTitle()).toMatch(/^Reçu QS-\d{4}-\d{6}$/);
  expect(errors).toEqual([]);
});

test("compte expiré en lecture seule → paiement Pro → accès rétabli immédiatement", async ({ page }) => {
  const user = await createConfirmedUser("paie-expire");
  await setSubscription(user.id, { status: "expired", current_period_end: iso(-8 * DAY) });
  await signInAs(page, user.email);
  await expect(page.getByText("Lecture seule").first()).toBeVisible();

  await choosePlan(page, "Choisir Pro");
  await expect(page.getByTestId("checkout-amount")).toHaveText(/15\s000\sFCFA/);
  await expect(page.getByRole("dialog")).toContainText("Actif immédiatement");
  await payInSandbox(page, "Orange Money");

  await expect(page.getByText("Paiement confirmé")).toBeVisible();
  await expect(page.getByText("Lecture seule")).toHaveCount(0);
  const { data: sub } = await adminClient().from("subscriptions").select("plan, status").eq("user_id", user.id).single();
  expect(sub).toEqual({ plan: "pro", status: "active" });
});

test("paiement refusé par l'opérateur → message clair, rien n'est activé", async ({ page }) => {
  const user = await createConfirmedUser("paie-echec");
  await setSubscription(user.id, { status: "expired", current_period_end: iso(-DAY) });
  await signInAs(page, user.email);
  await choosePlan(page, "Choisir Essentiel");
  await payInSandbox(page, "MTN Mobile Money", false);
  await expect(page.getByText("Le paiement n'a pas abouti")).toBeVisible();
  await expect(page.getByTestId("payment-history")).toContainText("Échoué");
  const { data: sub } = await adminClient().from("subscriptions").select("status").eq("user_id", user.id).single();
  expect(sub!.status).toBe("expired");
});

test("Essentiel → Pro au prorata, puis annulation et reprise", async ({ page }) => {
  const user = await createConfirmedUser("paie-upgrade");
  const end = iso(15 * DAY);
  await setSubscription(user.id, {
    plan: "essential",
    status: "active",
    billing_cycle: "monthly",
    currency: "XAF",
    current_period_start: iso(-15 * DAY),
    current_period_end: end,
  });
  await signInAs(page, user.email);

  await choosePlan(page, "Passer au Pro maintenant");
  // (15 000 − 5 000) × ~15/30 ≈ 5 000 FCFA, affiché avec le prix plein barré
  await expect(page.getByTestId("checkout-amount")).toHaveText(/5\s0\d\d\sFCFA/);
  await expect(page.getByRole("dialog")).toContainText("au prorata");
  await payInSandbox(page, "Carte bancaire");
  await expect(page.getByText("Paiement confirmé")).toBeVisible();
  const { data: sub } = await adminClient().from("subscriptions").select("plan, current_period_end").eq("user_id", user.id).single();
  expect(sub!.plan).toBe("pro");
  expect(new Date(sub!.current_period_end).getTime()).toBe(new Date(end).getTime());

  // Annulation : accès maintenu jusqu'à l'échéance, puis reprise
  await page.getByRole("button", { name: "Annuler l'abonnement" }).click();
  await page.getByRole("button", { name: "Confirmer l'annulation" }).click();
  await expect(page.getByText(/Abonnement annulé : accès complet jusqu'au/)).toBeVisible();
  await page.getByRole("button", { name: "Reprendre l'abonnement" }).click();
  await expect(page.getByText(/Abonnement annulé/)).toHaveCount(0);
  const { data: resumed } = await adminClient().from("subscriptions").select("cancel_at_period_end").eq("user_id", user.id).single();
  expect(resumed!.cancel_at_period_end).toBe(false);
});

test("sécurité : webhook non configuré, tâche planifiée protégée, faux retour de paiement ignoré", async ({ request, page }) => {
  expect((await request.post("/api/webhooks/flutterwave", { data: { event: "charge.completed" } })).status()).toBe(404);
  expect((await request.get("/api/cron/billing")).status()).toBe(401);
  const cron = await request.get("/api/cron/billing", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(cron.status()).toBe(200);
  expect(await cron.json()).toHaveProperty("reminders");

  // Un retour forgé (status=successful sans transaction signée) n'active rien.
  const user = await createConfirmedUser("paie-forge");
  await setSubscription(user.id, { status: "expired", current_period_end: iso(-DAY) });
  await signInAs(page, user.email);
  await choosePlan(page, "Choisir Pro");
  await page.getByRole("dialog").getByRole("button", { name: /^Payer/ }).click();
  await page.waitForURL(/\/paiement-test\?ref=QS-/);
  const ref = new URL(page.url()).searchParams.get("ref")!;
  await page.goto(`/api/billing/return?status=successful&tx_ref=${ref}&transaction_id=sbx_successful_mtn_${"0".repeat(32)}`);
  await expect(page).toHaveURL(/paiement=attente/);
  const { data: sub } = await adminClient().from("subscriptions").select("status").eq("user_id", user.id).single();
  expect(sub!.status).toBe("expired");
});
