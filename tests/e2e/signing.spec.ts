import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { adminClient, createConfirmedUser, signInAs } from "./helpers/accounts";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function drawSignature(page: Page) {
  const canvas = page.getByRole("dialog").locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 0; i <= 30; i++) {
    await page.mouse.move(box.x + 30 + i * ((box.width - 60) / 30), box.y + box.height * 0.6 - Math.sin(i / 3) * 35, { steps: 2 });
  }
  await page.mouse.up();
}

async function importDocument(page: Page, file: string) {
  await page.goto("/app/documents?importer=1");
  await page.getByTestId("upload-input").setInputFiles(fixture(file));
  await expect(page.getByRole("dialog").getByText("Prêt")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Signer maintenant" }).click();
  await expect(page).toHaveURL(/\/app\/documents\/[0-9a-f-]+$/);
}

test("créer sa signature (dessin et texte), la gérer dans la bibliothèque", async ({ page }) => {
  const user = await createConfirmedUser("biblio");
  await signInAs(page, user.email);
  await page.goto("/app/signatures");
  await page.getByRole("button", { name: "Nouvelle signature" }).click();
  await drawSignature(page);
  await page.getByLabel("Nom").fill("Signature officielle");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Enregistré dans votre bibliothèque.").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Signature officielle" })).toBeVisible({ timeout: 10_000 });

  // Paraphe tapé dans une écriture manuscrite
  await page.getByRole("button", { name: "Paraphe", exact: true }).click();
  await page.getByRole("tab", { name: "Taper" }).click();
  await page.getByPlaceholder("Votre nom").fill("A.N.");
  await page.getByRole("radio", { name: "A.N." }).nth(2).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("img", { name: "Paraphe" })).toBeVisible({ timeout: 10_000 });

  const { data } = await adminClient().from("signature_assets").select("type, method, is_default, svg_path").eq("owner_id", user.id).order("created_at");
  expect(data).toMatchObject([
    { type: "signature", method: "draw", is_default: true },
    { type: "initials", method: "type", is_default: true },
  ]);
  expect(data![0]!.svg_path).toContain(".svg");
});

test("signer un document : placer, déplacer, dater, finaliser, télécharger", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${e.name}: ${e.message}\n${e.stack}`));
  const user = await createConfirmedUser("signe");
  await signInAs(page, user.email);
  await importDocument(page, "annonce.pdf");
  const documentId = page.url().split("/").pop()!;

  await page.locator(`a[href$="/${documentId}/signer"]`).click();
  await expect(page).toHaveURL(/\/signer$/);
  await expect(page.getByTestId("page-layer-0")).toBeVisible({ timeout: 20_000 });

  // Pas encore de signature : l'outil ouvre la création
  await page.getByRole("button", { name: "Signature", exact: true }).first().click();
  await drawSignature(page);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

  // Outil armé : on touche la page pour placer
  const layer = page.getByTestId("page-layer-1");
  const box = (await layer.boundingBox())!;
  // locator.click fait défiler jusqu'au point visé (la page peut dépasser la hauteur de l'écran).
  await layer.click({ position: { x: box.width * 0.7, y: box.height * 0.85 } });
  const signature = layer.locator('[data-field-type="signature"]');
  await expect(signature).toBeVisible();

  // Déplacer au doigt/souris
  await signature.scrollIntoViewIfNeeded();
  const before = (await signature.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 - 120, before.y + before.height / 2 - 40, { steps: 8 });
  await page.mouse.up();
  const after = (await signature.boundingBox())!;
  expect(after.x).toBeLessThan(before.x - 80);

  // Date sur la même page, puis annuler / rétablir
  await page.getByRole("button", { name: "Date", exact: true }).first().click();
  await layer.click({ position: { x: box.width * 0.25, y: box.height * 0.85 } });
  await expect(layer.locator('[data-field-type="date"]')).toContainText("2026");
  await page.getByRole("button", { name: "Annuler" }).first().click();
  await expect(layer.locator('[data-field-type="date"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Rétablir" }).click();
  await expect(layer.locator('[data-field-type="date"]')).toHaveCount(1);

  // Brouillon enregistré automatiquement
  await expect(page.getByText("Brouillon enregistré")).toBeVisible({ timeout: 10_000 });
  const { count: draftCount } = await adminClient().from("placed_fields").select("id", { count: "exact", head: true }).eq("document_id", documentId);
  expect(draftCount).toBe(2);

  // Finaliser
  await page.getByRole("button", { name: /Finaliser et signer/ }).click();
  await expect(page.getByRole("dialog")).toContainText("2 éléments seront apposés sur 1 page");
  await page.getByRole("button", { name: "Signer le document" }).click();
  await expect(page.getByRole("heading", { name: "Document signé !" })).toBeVisible({ timeout: 30_000 });

  // Vérifications côté serveur
  const { data: doc } = await adminClient().from("documents").select("status, current_version, sha256, pdf_path").eq("id", documentId).single();
  expect(doc).toMatchObject({ status: "signed", current_version: 1 });
  await expect(page.getByText(doc!.sha256!)).toBeVisible();
  const { data: versions } = await adminClient().from("document_versions").select("version").eq("document_id", documentId).order("version");
  expect(versions!.map((v) => v.version)).toEqual([0, 1]);
  const { data: usage } = await adminClient().from("usage_counters").select("documents_signed").eq("user_id", user.id);
  expect(usage![0]!.documents_signed).toBe(1);
  const { data: audit } = await adminClient().from("audit_events").select("event_type, metadata").eq("document_id", documentId).eq("event_type", "document.signed");
  expect(audit).toHaveLength(1);

  // Le PDF téléchargé est signé, 2 pages, métadonnées QuickSign
  const link = page.getByRole("link", { name: "Télécharger" });
  const href = (await link.getAttribute("href"))!;
  const pdf = await PDFDocument.load(new Uint8Array(await (await fetch(href)).arrayBuffer()), { updateMetadata: false });
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getProducer()).toBe("QuickSign");
  expect(errors).toEqual([]);
});

test("un compte en lecture seule ne peut pas ouvrir l'éditeur ni signer", async ({ page }) => {
  const user = await createConfirmedUser("lecture");
  await signInAs(page, user.email);
  await importDocument(page, "annonce.pdf");
  const documentId = page.url().split("/").pop()!;
  await adminClient().from("subscriptions").update({ current_period_end: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", user.id);
  await page.goto(`/app/documents/${documentId}/signer`);
  await expect(page).toHaveURL(new RegExp(`/app/documents/${documentId}$`));
  await expect(page.locator(`a[href$="/${documentId}/signer"]`)).toHaveCount(0);
});
