import { expect, test } from "@playwright/test";
import { createConfirmedUser, signInAs, TEST_PASSWORD } from "./helpers/accounts";
import { totp } from "./helpers/totp";

test("double authentification : activation, connexion avec code, désactivation", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const user = await createConfirmedUser("deux-facteurs");
  await signInAs(page, user.email);

  // Activation depuis Paramètres → Sécurité : QR code + clé, puis premier code.
  await page.goto("/app/parametres?onglet=securite");
  await expect(page.getByTestId("mfa-status")).toHaveText("Désactivée");
  await page.getByRole("button", { name: "Activer la double authentification" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("mfa-qr")).toBeVisible();
  const secret = (await dialog.getByTestId("mfa-secret").textContent())!.trim();
  await dialog.getByLabel("Code à 6 chiffres").fill("000000");
  await dialog.getByRole("button", { name: "Activer" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Code incorrect");
  await dialog.getByLabel("Code à 6 chiffres").fill(totp(secret));
  await dialog.getByRole("button", { name: "Activer" }).click();
  await expect(page.getByTestId("mfa-status")).toHaveText("Activée", { timeout: 10_000 });

  // Nouvelle connexion : le mot de passe ne suffit plus.
  await page.context().clearCookies();
  await page.goto("/connexion?next=/app/documents");
  await page.getByLabel("Adresse e-mail").fill(user.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/connexion\/verification/);
  // Sans code : l'application renvoie vers la vérification, l'API refuse.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/connexion\/verification/);
  const api = await page.request.post("/api/assistant", {
    data: { message: "bonjour", path: "/app" },
  });
  expect(api.status()).toBe(401);

  await page.getByLabel("Code de vérification").fill("123456");
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page.getByText("Code incorrect ou expiré")).toBeVisible();
  await page.getByLabel("Code de vérification").fill(totp(secret));
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page).toHaveURL(/\/app/);

  // Désactivation : exige un code valide.
  await page.goto("/app/parametres?onglet=securite");
  await page.getByRole("button", { name: "Désactiver" }).click();
  await page.getByRole("dialog").getByLabel("Code à 6 chiffres").fill(totp(secret));
  await page.getByRole("dialog").getByRole("button", { name: "Désactiver" }).click();
  await expect(page.getByTestId("mfa-status")).toHaveText("Désactivée", { timeout: 10_000 });
});
