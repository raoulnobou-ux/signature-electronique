import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import path from "node:path";
import { adminClient, createConfirmedUser, signInAs } from "./helpers/accounts";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function importDocument(page: Page) {
  await page.goto("/app/documents?importer=1");
  await page.getByTestId("upload-input").setInputFiles(fixture("annonce.pdf"));
  await expect(page.getByRole("dialog").getByText("Prêt")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Signer maintenant" }).click();
  await expect(page).toHaveURL(/\/app\/documents\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}

async function drawSignature(page: Page) {
  await page.goto("/app/signatures");
  await page.getByRole("button", { name: "Nouvelle signature" }).click();
  const canvas = page.getByRole("dialog").locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) await page.mouse.move(box.x + 30 + i * ((box.width - 60) / 20), box.y + box.height * 0.6 - Math.sin(i / 2) * 30, { steps: 2 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
}

test("générateur de cachet : rond, texte circulaire, enregistré en PNG + SVG", async ({ page }) => {
  const user = await createConfirmedUser("cachet");
  await signInAs(page, user.email);
  await page.goto("/app/signatures");
  await page.getByRole("button", { name: "Cachet", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Générer" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Nom de la structure").fill("Cabinet Ngono & Associés");
  await page.getByLabel("Fonction").fill("Le Gérant");
  await page.getByLabel("Ville").fill("Douala");
  await expect(page.getByTestId("stamp-preview")).toContainText("CABINET NGONO & ASSOCIÉS");
  await page.getByRole("radio", { name: "Rectangle" }).click();
  await page.getByRole("radio", { name: "Rond" }).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  const { data } = await adminClient().from("signature_assets").select("type, method, svg_path").eq("owner_id", user.id).single();
  expect(data).toMatchObject({ type: "stamp", method: "generated" });
  expect(data!.svg_path).toMatch(/\.svg$/);
});

test("modèle : rôles, champ variable, création en un clic puis envoi", async ({ page }) => {
  test.setTimeout(120_000);
  const user = await createConfirmedUser("modele");
  await signInAs(page, user.email);
  await importDocument(page);

  await page.getByRole("button", { name: "Enregistrer comme modèle" }).click();
  await page.getByLabel("Nom du modèle").fill("Bail d'habitation");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/app\/modeles\/[0-9a-f-]+\/editer$/);
  await page.getByLabel("Rôle").fill("Locataire");
  await page.getByRole("button", { name: /Suivant/ }).click();
  const layer = page.getByTestId("page-layer-0");
  await expect(layer).toBeVisible({ timeout: 20_000 });
  const box = (await layer.boundingBox())!;
  await page.getByRole("button", { name: "Signature", exact: true }).click();
  await layer.click({ position: { x: box.width * 0.6, y: box.height * 0.8 } });
  await page.getByRole("button", { name: "Texte", exact: true }).click();
  await layer.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
  await page.getByLabel("Texte à remplir (indication)").fill("Nom du locataire");
  await page.getByRole("switch", { name: /Champ variable/ }).click();
  await page.getByRole("button", { name: /Suivant/ }).click();
  await expect(page.getByText("1 champ variable")).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer le modèle" }).first().click();
  await expect(page).toHaveURL(/\/app\/modeles$/);

  const list = page.getByTestId("template-list");
  await expect(list).toContainText("Bail d'habitation");
  await list.getByRole("button", { name: "Utiliser" }).click();
  await page.getByLabel("Nom du locataire").fill("Paul Biya Ekotto");
  await page.getByRole("button", { name: "Créer le document" }).click();
  await expect(page).toHaveURL(/\/demande\?modele=/, { timeout: 20_000 });
  await expect(page.getByText("(Locataire)")).toBeVisible();
  await page.getByLabel("Nom complet").fill("Paul Ekotto");
  await page.getByLabel("E-mail").fill(`paul-${Date.now()}@example.com`);
  await page.getByRole("button", { name: /Suivant/ }).click();
  await expect(page.locator('[data-field-type="signature"]')).toHaveCount(1, { timeout: 20_000 });
  await page.getByRole("button", { name: /Suivant/ }).click();
  await page.getByRole("button", { name: "Envoyer la demande" }).first().click();
  await expect(page).toHaveURL(/\/app\/demandes\//, { timeout: 20_000 });

  const { data: template } = await adminClient().from("templates").select("use_count").eq("owner_id", user.id).single();
  expect(template!.use_count).toBe(1);
  const { data: versions } = await adminClient()
    .from("document_versions")
    .select("note, documents!inner(owner_id)")
    .eq("documents.owner_id", user.id)
    .like("note", "Créé depuis le modèle%");
  expect(versions).toHaveLength(1);
});

test("signature en lot : 2 documents, un placement, archive ZIP", async ({ page }) => {
  test.setTimeout(150_000);
  const user = await createConfirmedUser("lot");
  await signInAs(page, user.email);
  await drawSignature(page);
  const first = await importDocument(page);
  const second = await importDocument(page);

  await page.goto("/app/documents");
  await page.getByRole("checkbox", { name: "Sélectionner annonce" }).first().click();
  await page.getByRole("checkbox", { name: "Sélectionner annonce" }).nth(1).click();
  await page.getByRole("button", { name: "Signer en lot" }).click();
  await expect(page).toHaveURL(/\/app\/documents\/lot\?ids=/);
  const layer = page.getByTestId("page-layer-1");
  await expect(layer).toBeAttached({ timeout: 20_000 });
  await page.getByRole("button", { name: "Signature", exact: true }).click();
  const box = (await layer.boundingBox())!;
  await layer.click({ position: { x: box.width * 0.6, y: box.height * 0.8 } });
  await page.getByRole("button", { name: "Signer les 2" }).click();
  const results = page.getByTestId("bulk-results");
  await expect(results.locator('[data-status="done"]')).toHaveCount(2, { timeout: 60_000 });

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger le ZIP" }).click();
  const zip = await JSZip.loadAsync(await readFile(await (await download).path()));
  expect(Object.keys(zip.files)).toHaveLength(2);

  const { data: docs } = await adminClient().from("documents").select("status, current_version").in("id", [first, second]);
  expect(docs!.every((d) => d.status === "signed" && d.current_version === 1)).toBe(true);
});

test("équipe : création, invitation, adhésion et plan Pro partagé", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const owner = await createConfirmedUser("team-owner", "Awa Ngono");
  const member = await createConfirmedUser("team-member", "Bruno Etoa");
  await adminClient().from("subscriptions").update({ status: "expired", current_period_end: new Date(Date.now() - 86_400_000).toISOString() }).eq("user_id", member.id);

  await signInAs(page, owner.email);
  await page.goto("/app/equipe");
  await page.getByLabel("Nom de l'équipe").fill("Cabinet Test");
  await page.getByRole("button", { name: "Créer l'équipe" }).click();
  await expect(page.getByRole("heading", { name: "Cabinet Test" })).toBeVisible();
  await page.getByLabel("Inviter par e-mail").fill(member.email);
  await page.getByRole("button", { name: "Inviter" }).click();
  await expect(page.getByTestId("team-invitation")).toContainText(member.email);
  await expect(page.getByText("2 / 5 places")).toBeVisible();

  // Le lien est envoyé par e-mail : on fixe ici un jeton connu pour le test.
  const token = `test-invite-${Date.now()}-abcdefghij`;
  await adminClient()
    .from("team_invitations")
    .update({ token_hash: createHash("sha256").update(token).digest("hex") })
    .eq("email", member.email);

  const context = await browser.newContext();
  const memberPage = await context.newPage();
  await signInAs(memberPage, member.email);
  await expect(memberPage.getByText("Lecture seule").first()).toBeVisible();
  await memberPage.goto(`/invitation/${token}`);
  await memberPage.getByRole("button", { name: "Rejoindre l'équipe" }).click();
  await expect(memberPage).toHaveURL(/\/app\/equipe$/);
  await expect(memberPage.getByTestId("team-members")).toContainText("Awa Ngono");
  await memberPage.goto("/app/abonnement");
  await expect(memberPage.getByText("Plan Pro inclus grâce à votre équipe « Cabinet Test »")).toBeVisible();
  await expect(memberPage.getByText("Lecture seule")).toHaveCount(0);
  await context.close();

  await page.reload();
  await expect(page.getByTestId("team-members")).toContainText("Bruno Etoa");
  await expect(page.getByTestId("team-activity")).toContainText("a rejoint l'équipe");
});
