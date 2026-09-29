import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createConfirmedUser, signInAs } from "./helpers/accounts";

// Assistant simulé (AI_MOCK=true) : mêmes flux, actions, quotas et historique que le vrai modèle.
const fixture = (name: string) => path.join(__dirname, "fixtures", name);
const DAY = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

async function openAssistant(page: Page) {
  await page.getByTestId("assistant-bubble").click();
  const panel = page.getByTestId("assistant-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function makeEssential(userId: string) {
  const { error } = await adminClient()
    .from("subscriptions")
    .update({
      plan: "essential",
      status: "active",
      billing_cycle: "monthly",
      currency: "XAF",
      current_period_start: iso(-DAY),
      current_period_end: iso(29 * DAY),
    })
    .eq("user_id", userId);
  if (error) throw error;
}

test("question libre : réponse en flux, historique conservé", async ({ page }) => {
  const user = await createConfirmedUser("ia-chat");
  await signInAs(page, user.email);
  await page.goto("/app");
  const panel = await openAssistant(page);
  await expect(panel.getByText("Bonjour Awa")).toBeVisible();
  await panel.getByRole("textbox").fill("Quelle différence entre Essentiel et Pro ?");
  await panel.getByRole("button", { name: "Envoyer" }).click();
  const messages = panel.getByTestId("assistant-messages");
  await expect(messages.locator('[data-role="assistant"]').last()).toContainText("15 000 FCFA", {
    timeout: 15_000,
  });

  // Historique : la conversation est enregistrée et peut être rouverte.
  await panel.getByRole("button", { name: "Nouvelle conversation" }).click();
  await expect(messages.locator('[data-role="assistant"]')).toHaveCount(0);
  await panel.getByRole("button", { name: "Historique" }).click();
  await panel
    .getByTestId("assistant-history")
    .getByRole("button", { name: /Essentiel et Pro/ })
    .click();
  await expect(panel.getByTestId("assistant-messages")).toContainText("15 000 FCFA");

  const { data } = await adminClient()
    .from("usage_counters")
    .select("ai_messages")
    .eq("user_id", user.id);
  expect(data?.reduce((n, r) => n + r.ai_messages, 0)).toBe(1);
});

test("visite guidée : l'assistant montre le bouton Importer", async ({ page }) => {
  const user = await createConfirmedUser("ia-visite");
  await signInAs(page, user.email);
  await page.goto("/app");
  const panel = await openAssistant(page);
  await panel.getByRole("button", { name: "Importer un Word" }).click();
  // Le panneau se ferme, l'application va sur Documents et met le bouton en évidence.
  await expect(panel).toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/app\/documents/);
  await expect(page.locator('[data-tour="import"].tour-highlight')).toBeVisible({
    timeout: 10_000,
  });
});

test("palette Ctrl+K : poser une question à l'assistant", async ({ page, isMobile }) => {
  test.skip(isMobile, "raccourci clavier");
  const user = await createConfirmedUser("ia-palette");
  await signInAs(page, user.email);
  await page.goto("/app");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Rechercher une page ou une action…").fill("prix du plan pro");
  await page.getByTestId("palette-assistant").click();
  const panel = page.getByTestId("assistant-panel");
  await expect(panel.locator('[data-role="user"]')).toContainText("prix du plan pro");
  await expect(panel.locator('[data-role="assistant"]').last()).toContainText("Pro", {
    timeout: 15_000,
  });
});

test("Pro : zones de signature repérées puis demande préremplie", async ({ page }) => {
  test.setTimeout(90_000);
  const user = await createConfirmedUser("ia-zones");
  await signInAs(page, user.email);
  await page.goto("/app/documents?importer=1");
  await page.getByTestId("upload-input").setInputFiles(fixture("annonce.pdf"));
  await expect(page.getByRole("dialog").getByText("Prêt")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Signer maintenant" }).click();
  await expect(page).toHaveURL(/\/app\/documents\/[0-9a-f-]+$/);
  const documentId = page.url().split("/").pop()!;

  // Joindre le document = consentement explicite ; l'analyse démarre.
  await page.getByTestId("analyze-document").click();
  const panel = page.getByTestId("assistant-panel");
  await expect(panel.locator('[data-role="user"]')).toContainText("annonce");
  await expect(panel.locator('[data-role="assistant"]').last()).toContainText("résumé", {
    timeout: 20_000,
  });

  // Demande en une phrase : zones repérées sur le document joint.
  await panel.getByRole("textbox").fill("Repère les zones de signature");
  await panel.getByRole("button", { name: "Envoyer" }).click();
  const zones = panel.getByTestId("action-zones");
  await expect(zones).toContainText("2 zone(s)", { timeout: 20_000 });
  await zones.getByRole("button", { name: /demande/i }).click();

  await expect(page).toHaveURL(new RegExp(`/app/documents/${documentId}/demande\\?assistant=1`));
  await expect(page.getByText("(Signataire)")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Nom complet").first().fill("Paul Ekotto");
  await page.getByLabel("E-mail").first().fill("paul.ekotto@example.com");
  await page.getByRole("button", { name: /Suivant/ }).click();
  // Une zone par page (« Signature : » en bas de chaque page), rattachée au signataire.
  await expect(
    page.getByTestId("page-layer-0").getByRole("button", { name: "signature" }),
  ).toHaveCount(1, { timeout: 20_000 });
});

test("Pro : brouillon rédigé → PDF créé dans Documents", async ({ page }) => {
  const user = await createConfirmedUser("ia-redaction");
  await signInAs(page, user.email);
  await page.goto("/app/assistant");
  await page.getByRole("textbox").fill("Rédige une attestation de travail");
  await page.getByRole("button", { name: "Envoyer" }).click();
  const card = page.getByTestId("action-draft");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: /Créer le PDF/ }).click();
  await card.getByRole("link", { name: /Ouvrir/ }).click();
  await expect(page).toHaveURL(/\/app\/documents\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Attestation de travail" })).toBeVisible();
});

test("Essentiel : pas de document joint, quota de 20 messages par jour", async ({ page }) => {
  const user = await createConfirmedUser("ia-essentiel");
  await makeEssential(user.id);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());
  await adminClient()
    .from("usage_counters")
    .upsert({ user_id: user.id, day: today, ai_messages: 19 });
  await signInAs(page, user.email);
  await page.goto("/app");
  const panel = await openAssistant(page);
  await expect(panel.getByText("1 message restant aujourd'hui")).toBeVisible();
  await panel.getByRole("textbox").fill("Comment signer un document ?");
  await panel.getByRole("button", { name: "Envoyer" }).click();
  await expect(panel.getByText("Plus de message aujourd'hui")).toBeVisible({ timeout: 15_000 });
  await panel.getByRole("textbox").fill("Encore une question");
  await panel.getByRole("button", { name: "Envoyer" }).click();
  await expect(panel.getByRole("alert")).toContainText("20 messages du jour");

  // Analyse de document réservée au Pro : l'API refuse même si on force l'appel.
  const response = await page.request.post("/api/assistant", {
    data: { message: "résume", documentId: "00000000-0000-4000-8000-000000000000", path: "/app" },
  });
  expect(await response.text()).toContain("feature_not_in_plan");
});
