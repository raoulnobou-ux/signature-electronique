import { expect, test } from "@playwright/test";
import path from "node:path";
import { adminClient, createConfirmedUser, signInAs } from "./helpers/accounts";

test("modifier son profil, sa structure et sa photo", async ({ page }) => {
  const user = await createConfirmedUser("profil");
  await signInAs(page, user.email);
  await page.goto("/app/parametres");

  await page.getByLabel("Nom complet").fill("Awa Nkeng Epse Fotso");
  await page.getByRole("textbox", { name: "Téléphone" }).fill("655 44 33 22");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Modifications enregistrées.")).toBeVisible();

  // Photo de profil (PNG réel)
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(__dirname, "fixtures", "avatar.png"));
  await expect(page.getByRole("button", { name: "Retirer" })).toBeVisible();

  await page.getByRole("tab", { name: "Structure" }).click();
  await expect(page).toHaveURL(/onglet=structure/);
  await page.getByRole("radio", { name: "École" }).click();
  await page.getByLabel("Nom de la structure").fill("Institut Bilingue de Bonamoussadi");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  const profile = async () =>
    (await adminClient().from("profiles").select("*").eq("id", user.id).single()).data;
  await expect.poll(async () => (await profile())?.account_type).toBe("school");
  const data = await profile();
  expect(data.full_name).toBe("Awa Nkeng Epse Fotso");
  expect(data.phone).toBe("+237655443322");
  expect(data.account_type).toBe("school");
  expect(data.org_name).toBe("Institut Bilingue de Bonamoussadi");
  expect(data.avatar_url).toContain("/avatars/");
});

test("une fausse image (texte renommé en .png) est refusée", async ({ page }) => {
  const user = await createConfirmedUser("avatar");
  await signInAs(page, user.email);
  await page.goto("/app/parametres");
  await page.locator('input[type="file"]').setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from("<script>alert(1)</script>"),
  });
  await expect(page.getByText(/Image non valide/)).toBeVisible();
});

test("export des données et suppression du compte", async ({ page }) => {
  const user = await createConfirmedUser("suppr");
  await signInAs(page, user.email);

  const response = await page.request.get("/api/account/export");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.account.email).toBe(user.email);
  expect(body.subscription.plan).toBe("trial");

  await page.goto("/app/parametres?onglet=zone-sensible");
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  const confirm = page.getByRole("button", { name: "Supprimer définitivement" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("dialog").getByRole("textbox").fill("SUPPRIMER");
  await confirm.click();
  await expect(page).toHaveURL(/compte-supprime=1/);

  const { data } = await adminClient().auth.admin.getUserById(user.id);
  expect(data.user).toBeNull();
});

test("à la fin de l'essai, le compte passe en lecture seule", async ({ page }) => {
  const user = await createConfirmedUser("expire");
  await adminClient()
    .from("subscriptions")
    .update({ current_period_end: new Date(Date.now() - 60_000).toISOString() })
    .eq("user_id", user.id);

  await signInAs(page, user.email);
  await expect(page.getByText("Compte en lecture seule")).toBeVisible();
  await expect(page.getByRole("link", { name: "Passer à un plan" })).toBeVisible();

  // Garde-fou en base : impossible de créer un document, même en contournant l'interface.
  const { error } = await adminClient().rpc("can_write", { p_user_id: user.id });
  expect(error).toBeNull();
  const { data: canWrite } = await adminClient().rpc("can_write", { p_user_id: user.id });
  expect(canWrite).toBe(false);
});

test("la jauge d'essai et le bandeau de fin d'essai apparaissent à J-2", async ({ page }) => {
  const user = await createConfirmedUser("jmoins2");
  await adminClient()
    .from("subscriptions")
    .update({ current_period_end: new Date(Date.now() + 36 * 3600_000).toISOString() })
    .eq("user_id", user.id);
  await signInAs(page, user.email);
  await expect(page.getByText(/Votre essai se termine/)).toBeVisible();
});
