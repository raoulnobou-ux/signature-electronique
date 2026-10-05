import { expect, test } from "@playwright/test";
import { extractLink, uniqueEmail, waitForEmail } from "./helpers/mailpit";

const PASSWORD = "Ndole-Plantain-2026";

test.describe.configure({ mode: "serial" });

test("inscription en 2 étapes, confirmation par e-mail, accès gratuit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = uniqueEmail("awa");

  await page.goto("/inscription");
  await expect(page.getByRole("heading", { name: "Créez votre compte" })).toBeVisible();

  // Étape 1 : validation côté client
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Trop court.").first()).toBeVisible();

  await page.getByLabel("Nom complet").fill("Awa Nkeng");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("textbox", { name: "Téléphone" }).fill("6 90 12 34 56");
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await expect(page.getByText("Excellent")).toBeVisible();
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continuer" }).click();

  // Étape 2 : profil
  await expect(page.getByRole("heading", { name: "Parlez-nous de votre structure" })).toBeVisible();
  await page.getByRole("radio", { name: "Cabinet" }).click();
  await page.getByLabel("Nom de la structure").fill("Cabinet Nkeng & Associés");
  await page.getByLabel("Ville").fill("Douala");
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  // Étape 3 : vérifier l'e-mail
  await expect(page.getByRole("heading", { name: "Vérifiez votre boîte e-mail" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // Connexion impossible avant confirmation
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(/pas encore confirmée/)).toBeVisible();

  // Lien de confirmation (fonctionne dans un autre navigateur/appareil : token_hash)
  const mail = await waitForEmail(email, "Confirmez votre adresse");
  const link = extractLink(mail.html, "/auth/confirm");
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/\/app\/bienvenue/);
  await expect(page.getByRole("heading", { name: "Bienvenue, Awa !" })).toBeVisible();

  // E-mail de bienvenue envoyé une fois (journalisé sans clé Resend en local)
  await page.getByRole("button", { name: "Explorer d'abord" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Awa");
  // Accès gratuit limité : aucun essai, choix d'un plan proposé pour signer.
  await expect(page.getByText("Accès gratuit —")).toBeVisible();
  await expect(page.getByText(/jours? restants?/)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("connexion, déconnexion et protection des pages", async ({ page, browser }) => {
  const email = uniqueEmail("jean");
  // Création directe d'un compte confirmé via l'inscription + lien
  await page.goto("/inscription");
  await page.getByLabel("Nom complet").fill("Jean Fotso");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("textbox", { name: "Téléphone" }).fill("677 00 11 22");
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Passer cette étape" }).click();
  await expect(page.getByRole("heading", { name: "Vérifiez votre boîte e-mail" })).toBeVisible();
  await page.goto(extractLink((await waitForEmail(email, "Confirmez")).html, "/auth/confirm"));
  await expect(page).toHaveURL(/\/app\/bienvenue/);

  // Un visiteur non connecté est renvoyé vers la connexion
  const anon = await browser.newPage();
  await anon.goto("/app/parametres");
  await expect(anon).toHaveURL(/\/connexion\?next=%2Fapp%2Fparametres/);

  // Mauvais mot de passe puis bon mot de passe, avec retour vers la page demandée
  await anon.getByLabel("Adresse e-mail").fill(email);
  await anon.getByLabel("Mot de passe", { exact: true }).fill("Mauvais-2026");
  await anon.getByRole("button", { name: "Se connecter" }).click();
  await expect(anon.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeVisible();
  await anon.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await anon.getByRole("button", { name: "Se connecter" }).click();
  await expect(anon).toHaveURL(/\/app\/parametres/);

  // Déconnexion
  await anon.getByRole("button", { name: /Mon profil/ }).click();
  await anon.getByRole("menuitem", { name: "Se déconnecter" }).click();
  await expect(anon).toHaveURL(/\/connexion\?deconnecte=1/);
  await expect(anon.getByText("Vous êtes déconnecté.")).toBeVisible();
});

test("mot de passe oublié puis réinitialisation", async ({ page }) => {
  const email = uniqueEmail("marie");
  await page.goto("/inscription");
  await page.getByLabel("Nom complet").fill("Marie Ngo");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("textbox", { name: "Téléphone" }).fill("699 88 77 66");
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Passer cette étape" }).click();
  await page.goto(extractLink((await waitForEmail(email, "Confirmez")).html, "/auth/confirm"));
  await page.context().clearCookies();

  await page.goto("/mot-de-passe-oublie");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(page.getByRole("heading", { name: "Consultez votre boîte e-mail" })).toBeVisible();

  const reset = await waitForEmail(email, "Réinitialisation");
  await page.goto(extractLink(reset.html, "/auth/confirm"));
  await expect(page).toHaveURL(/reinitialiser-mot-de-passe/);
  await page.getByLabel("Nouveau mot de passe").fill("Nouveau-Secret-2027");
  await page.getByLabel("Confirmez le mot de passe").fill("Nouveau-Secret-2027");
  await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
  await expect(page).toHaveURL(/\/app\?mot-de-passe=modifie/);
  await expect(page.getByText("Votre mot de passe a bien été modifié.")).toBeVisible();
});

test("un lien de confirmation invalide est refusé proprement", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=faux&type=email&next=/app");
  await expect(page).toHaveURL(/erreur=lien-invalide/);
  await expect(page.getByText(/n'est plus valide/)).toBeVisible();
});

test("inscription : une adresse e-mail jetable est refusée avec un message clair", async ({
  page,
}) => {
  await page.goto("/inscription");
  await page.getByLabel("Nom complet").fill("Test Jetable");
  await page.getByLabel("Adresse e-mail").fill(`jetable-${Date.now()}@yopmail.com`);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(
    page.getByText("Les adresses e-mail temporaires ne sont pas acceptées.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
});
