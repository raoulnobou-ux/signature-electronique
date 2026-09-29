import { createHmac } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { adminClient, createConfirmedUser, signInAs } from "./helpers/accounts";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

/** Même dérivation que lib/requests/tokens.ts (LINK_SECRET absent en local). */
function signerLink(signerId: string, version = 1) {
  const secret = process.env.LINK_SECRET ?? `links:${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  const token = createHmac("sha256", secret)
    .update(`signer:${signerId}:${version}`)
    .digest("base64url");
  return `/s/${token}`;
}

async function importDocument(page: Page) {
  await page.goto("/app/documents?importer=1");
  await page.getByTestId("upload-input").setInputFiles(fixture("annonce.pdf"));
  await expect(page.getByRole("dialog").getByText("Prêt")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Signer maintenant" }).click();
  await expect(page).toHaveURL(/\/app\/documents\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}

async function placeZone(page: Page, tool: string, x: number, y: number) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  const layer = page.getByTestId("page-layer-0");
  const box = (await layer.boundingBox())!;
  await layer.click({ position: { x: box.width * x, y: box.height * y } });
}

/** Crée une demande depuis l'interface et renvoie son identifiant. */
async function createRequest(
  page: Page,
  documentId: string,
  signers: { name: string; email: string }[],
  parallel = false,
) {
  await page.locator(`a[href$="/${documentId}/demande"]`).click();
  await expect(page).toHaveURL(/\/demande$/);
  for (const [i, s] of signers.entries()) {
    if (i > 0) await page.getByRole("button", { name: "Ajouter un signataire" }).click();
    await page.getByLabel("Nom complet").nth(i).fill(s.name);
    await page.getByLabel("E-mail").nth(i).fill(s.email);
  }
  if (parallel) await page.getByRole("radio", { name: /En même temps/ }).click();
  await page.getByRole("button", { name: /Suivant/ }).click();
  await expect(page.getByTestId("page-layer-0")).toBeVisible({ timeout: 20_000 });
  for (const [i, s] of signers.entries()) {
    await page.getByRole("radio", { name: new RegExp(s.name) }).click();
    await placeZone(page, "Signature", 0.3 + i * 0.35, 0.8);
  }
  await page.getByRole("radio", { name: new RegExp(signers[0]!.name) }).click();
  await placeZone(page, "Date", 0.3, 0.9);
  await page.getByRole("button", { name: /Suivant/ }).click();
  await expect(page.getByText("Tout est prêt")).toBeVisible();
  await page.getByRole("button", { name: "Envoyer la demande" }).first().click();
  await expect(page).toHaveURL(/\/app\/demandes\/[0-9a-f-]+\?envoyee=1/, { timeout: 20_000 });
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function signAs(browser: Browser, link: string, isMobile: boolean) {
  const context = await browser.newContext(
    isMobile ? { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true } : {},
  );
  const page = await context.newPage();
  await page.goto(link);
  await page.getByRole("button", { name: "Lire et signer" }).click();
  const zone = page.locator('[data-field-type="signature"]');
  await expect(zone).toBeVisible({ timeout: 20_000 });
  await zone.click();
  const canvas = page.getByRole("dialog").locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++)
    await page.mouse.move(
      box.x + 30 + i * ((box.width - 60) / 20),
      box.y + box.height * 0.6 - Math.sin(i / 2) * 30,
      { steps: 2 },
    );
  await page.mouse.up();
  await page.getByRole("button", { name: "Utiliser" }).click();
  await page.getByRole("button", { name: "Terminer et signer" }).click();
  await page.getByRole("checkbox", { name: /J'ai lu le document/ }).click();
  await page.getByRole("button", { name: "Signer maintenant" }).click();
  return { page, context };
}

test("demande à 2 signataires dans l'ordre → certificat → vérification publique", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const owner = await createConfirmedUser("demande");
  await signInAs(page, owner.email);
  const documentId = await importDocument(page);
  const requestId = await createRequest(page, documentId, [
    { name: "Awa Ngono", email: `awa-${Date.now()}@example.com` },
    { name: "Bruno Etoa", email: `bruno-${Date.now()}@example.com` },
  ]);

  const tracking = page.getByTestId("request-signers");
  await expect(tracking.locator("li").nth(0)).toHaveAttribute("data-status", "sent");
  await expect(tracking.locator("li").nth(1)).toHaveAttribute("data-status", "pending");

  const { data: signers } = await adminClient()
    .from("request_signers")
    .select("id, name")
    .eq("request_id", requestId)
    .order("order_index");
  const [first, second] = signers!;

  // Le 2e signataire doit attendre son tour.
  const early = await browser.newContext();
  const earlyPage = await early.newPage();
  await earlyPage.goto(signerLink(second!.id));
  await expect(
    earlyPage.getByRole("heading", { name: "Ce n'est pas encore votre tour" }),
  ).toBeVisible();
  await early.close();

  const isMobile = info.project.name === "mobile";
  const a = await signAs(browser, signerLink(first!.id), isMobile);
  await expect(a.page.getByRole("heading", { name: "Merci, c'est signé !" })).toBeVisible({
    timeout: 30_000,
  });
  await a.context.close();

  const b = await signAs(browser, signerLink(second!.id), isMobile);
  await expect(b.page.getByRole("heading", { name: "Merci, c'est signé !" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(b.page.getByRole("link", { name: "Télécharger le document signé" })).toBeVisible();
  await b.context.close();

  // Côté serveur : demande terminée, certificat, versions successives.
  const { data: request } = await adminClient()
    .from("signature_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  expect(request).toMatchObject({ status: "completed", final_version: 2 });
  expect(request!.certificate_path).toBeTruthy();
  const { data: doc } = await adminClient()
    .from("documents")
    .select("status, sha256, pdf_path")
    .eq("id", documentId)
    .single();
  expect(doc).toMatchObject({ status: "signed", sha256: request!.final_sha256 });
  const { data: certificate } = await adminClient()
    .storage.from("certificates")
    .download(request!.certificate_path!);
  const certPdf = await PDFDocument.load(new Uint8Array(await certificate!.arrayBuffer()), {
    updateMetadata: false,
  });
  expect(certPdf.getTitle()).toContain("Certificat de signature");
  const { data: events } = await adminClient()
    .from("audit_events")
    .select("event_type")
    .eq("request_id", requestId);
  const types = events!.map((e) => e.event_type);
  expect(types).toEqual(
    expect.arrayContaining([
      "request.created",
      "signer.opened",
      "signer.signed",
      "request.completed",
    ]),
  );

  // Suivi propriétaire : terminé, téléchargements disponibles.
  await page.reload();
  await expect(page.getByRole("button", { name: "Télécharger le PDF signé" })).toBeVisible();

  // Vérification publique du fichier final (transmis en mémoire : le chemin des résultats
  // de test contient des caractères que le sélecteur de fichiers de Chromium gère mal).
  const { data: finalFile } = await adminClient()
    .storage.from("documents")
    .download(doc!.pdf_path!);
  await page.goto(`/verify/${requestId}`);
  await expect(page.getByRole("heading", { name: "Document signé et vérifiable" })).toBeVisible();
  await page.waitForLoadState("networkidle"); // le dépôt de fichier est actif après l'hydratation
  await page.getByTestId("verify-input").setInputFiles({
    name: "final.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await finalFile!.arrayBuffer()),
  });
  await expect(page.getByTestId("verify-result")).toContainText("Authentique");
  await page.getByTestId("verify-input").setInputFiles(fixture("annonce.pdf"));
  await expect(page.getByTestId("verify-result")).toContainText("document original");
});

test("refus d'un signataire, puis annulation d'une autre demande", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const owner = await createConfirmedUser("refus");
  await signInAs(page, owner.email);
  const documentId = await importDocument(page);
  const requestId = await createRequest(page, documentId, [
    { name: "Chantal Mbarga", email: `chantal-${Date.now()}@example.com` },
  ]);
  const { data: signer } = await adminClient()
    .from("request_signers")
    .select("id")
    .eq("request_id", requestId)
    .single();

  const context = await browser.newContext();
  const signerPage = await context.newPage();
  await signerPage.goto(signerLink(signer!.id));
  await signerPage.getByRole("button", { name: "Lire et signer" }).click();
  await signerPage.getByRole("button", { name: "Refuser", exact: true }).click();
  await signerPage.getByLabel("Motif du refus").fill("Le montant est erroné.");
  await signerPage.getByRole("button", { name: "Refuser de signer" }).click();
  await expect(signerPage.getByRole("heading", { name: "Signature refusée" })).toBeVisible();
  await context.close();

  await page.reload();
  await expect(page.getByText("Motif : « Le montant est erroné. »")).toBeVisible();
  const { data: doc } = await adminClient()
    .from("documents")
    .select("status")
    .eq("id", documentId)
    .single();
  expect(doc!.status).toBe("declined");

  // Nouvelle demande sur le même document, puis annulation par le propriétaire.
  await page.goto(`/app/documents/${documentId}`);
  const second = await createRequest(page, documentId, [
    { name: "Chantal Mbarga", email: `chantal2-${Date.now()}@example.com` },
  ]);
  await page.getByRole("button", { name: "Annuler la demande" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Annuler la demande" }).click();
  await expect(page.getByText("Annulée").first()).toBeVisible();
  const { data: s2 } = await adminClient()
    .from("request_signers")
    .select("id")
    .eq("request_id", second)
    .single();
  const later = await browser.newContext();
  const laterPage = await later.newPage();
  await laterPage.goto(signerLink(s2!.id));
  await expect(laterPage.getByRole("heading", { name: "Demande annulée" })).toBeVisible();
  await later.close();
});

test("lien de signature invalide ou forgé", async ({ page }) => {
  await page.goto(`/s/${"A".repeat(43)}`);
  await expect(page.getByRole("heading", { name: "Lien invalide" })).toBeVisible();
  await page.goto("/s/court");
  await expect(page.getByRole("heading", { name: "Lien invalide" })).toBeVisible();
});
