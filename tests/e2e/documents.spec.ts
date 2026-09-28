import { expect, test } from "@playwright/test";
import path from "node:path";
import { adminClient, createConfirmedUser, signInAs } from "./helpers/accounts";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

test.describe("documents", () => {
  test("importer un PDF, un Word et une photo, puis les retrouver", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const user = await createConfirmedUser("docs");
    await signInAs(page, user.email);

    await page.goto("/app/documents");
    await expect(
      page.getByRole("heading", { name: "Aucun document pour l'instant" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Importer" }).first().click();
    await expect(page.getByRole("dialog")).toContainText("Importer des documents");

    await page
      .getByTestId("upload-input")
      .setInputFiles([fixture("annonce.pdf"), fixture("contrat.docx"), fixture("avatar.png")]);
    await expect(page.getByRole("dialog").getByText("Prêt")).toHaveCount(3, { timeout: 60_000 });
    await page.getByRole("button", { name: "Fermer" }).first().click();

    await expect(page.getByText("annonce", { exact: true })).toBeVisible();
    await expect(page.getByText("contrat", { exact: true })).toBeVisible();
    await expect(page.getByText("avatar", { exact: true })).toBeVisible();

    const { data: docs } = await adminClient()
      .from("documents")
      .select("title, original_type, page_count, sha256, thumbnail_path, pdf_path")
      .eq("owner_id", user.id)
      .order("title");
    expect(docs).toHaveLength(3);
    const byTitle = Object.fromEntries(docs!.map((d) => [d.title, d]));
    expect(byTitle.annonce).toMatchObject({ original_type: "pdf", page_count: 2 });
    expect(byTitle.contrat).toMatchObject({ original_type: "docx", page_count: 1 });
    expect(byTitle.avatar).toMatchObject({ original_type: "png", page_count: 1 });
    for (const d of docs!) {
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(d.thumbnail_path).toContain("thumbnail.jpg");
    }
    // Le Word d'origine est conservé à côté du PDF converti.
    expect(byTitle.contrat!.pdf_path).toContain("document.pdf");

    // Détail : visionneuse et empreinte
    await page.getByText("contrat", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "contrat" })).toBeVisible();
    await expect(page.getByText("Page 1 sur 1")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(byTitle.contrat!.sha256!)).toBeVisible();
    await expect(page.getByText("Word (.docx)")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("un faux fichier est refusé avec un message clair", async ({ page }) => {
    const user = await createConfirmedUser("faux");
    await signInAs(page, user.email);
    await page.goto("/app/documents?importer=1");
    await page.getByTestId("upload-input").setInputFiles({
      name: "facture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("MZ ce n'est pas un PDF, c'est un exécutable"),
    });
    await expect(page.getByText(/Format non pris en charge/)).toBeVisible({ timeout: 20_000 });
    const { count } = await adminClient()
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id);
    expect(count).toBe(0);
  });

  test("un lien vers une adresse interne est bloqué (SSRF)", async ({ page }) => {
    const user = await createConfirmedUser("ssrf");
    await signInAs(page, user.email);
    await page.goto("/app/documents?importer=1");
    await page.getByRole("button", { name: "Importer depuis un lien" }).click();
    await page
      .getByRole("textbox", { name: "Importer depuis un lien" })
      .fill("http://127.0.0.1:54321/rest/v1/");
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await expect(page.getByText(/adresse non autorisée/)).toBeVisible({ timeout: 20_000 });
  });

  test("organiser : dossier, étiquette, recherche, corbeille, restauration, suppression", async ({
    page,
  }) => {
    const user = await createConfirmedUser("orga");
    await signInAs(page, user.email);
    await page.goto("/app/documents?importer=1");
    await page
      .getByTestId("upload-input")
      .setInputFiles([fixture("annonce.pdf"), fixture("avatar.png")]);
    await expect(page.getByRole("dialog").getByText("Prêt")).toHaveCount(2, { timeout: 60_000 });
    await page.keyboard.press("Escape");

    // Dossier
    await page.getByRole("button", { name: "Nouveau dossier" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("Annonces 2026");
    await page.getByRole("dialog").getByRole("button", { name: "Nouveau dossier" }).click();
    await expect(page.getByRole("button", { name: "Annonces 2026" })).toBeVisible();

    // Déplacer « annonce » dans le dossier
    await page.getByRole("button", { name: "Actions — annonce" }).click();
    await page.getByRole("menuitem", { name: "Déplacer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Annonces 2026" }).click();
    await expect(page.getByText("Déplacé.")).toBeVisible();
    await page.getByRole("button", { name: "Annonces 2026" }).click();
    await expect(page.getByText("annonce", { exact: true })).toBeVisible();
    await expect(page.getByText("avatar", { exact: true })).toHaveCount(0);

    // Recherche
    await page.getByRole("button", { name: "Tous les documents" }).click();
    await page.getByRole("searchbox").fill("avat");
    await expect(page).toHaveURL(/q=avat/);
    await expect(page.getByText("annonce", { exact: true })).toHaveCount(0);
    await page.getByRole("searchbox").fill("");
    await expect(page.getByText("annonce", { exact: true })).toBeVisible();

    // Corbeille puis restauration
    await page.getByRole("button", { name: "Actions — avatar" }).click();
    await page.getByRole("menuitem", { name: "Mettre à la corbeille" }).click();
    await expect(page.getByText("Document mis à la corbeille.")).toBeVisible();
    await page.getByRole("button", { name: "Corbeille" }).click();
    await expect(page.getByText("avatar", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Actions — avatar" }).click();
    await page.getByRole("menuitem", { name: "Restaurer" }).click();
    await expect(page.getByText("Document restauré.")).toBeVisible();

    // Suppression définitive (depuis la corbeille)
    await page.getByRole("button", { name: "Tous les documents" }).click();
    await page.getByRole("button", { name: "Actions — avatar" }).click();
    await page.getByRole("menuitem", { name: "Mettre à la corbeille" }).click();
    await page.getByRole("button", { name: "Corbeille" }).click();
    await page.getByRole("button", { name: "Actions — avatar" }).click();
    await page.getByRole("menuitem", { name: "Supprimer définitivement" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Supprimer définitivement" })
      .click();
    await expect(page.getByRole("heading", { name: "La corbeille est vide" })).toBeVisible();

    const { data } = await adminClient().storage.from("documents").list(user.id);
    expect(data?.length).toBe(1); // seul le dossier du document « annonce » subsiste
  });
});

test("scanner : photo d'une feuille → redressement → PDF importé", async ({ page }) => {
  const user = await createConfirmedUser("scan");
  await signInAs(page, user.email);
  await page.goto("/app/documents?importer=1");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Scanner avec l'appareil photo" }).click();
  await (await chooser).setFiles(fixture("photo-feuille.png"));

  await expect(page.getByText("Ajustez les coins")).toBeVisible();
  await expect(page.getByRole("button", { name: "Coin 1" })).toBeVisible();
  await page.getByRole("button", { name: "Utiliser ce scan" }).click();
  await page.getByRole("button", { name: "Terminer (1 page)" }).click();
  await expect(page.getByRole("dialog").getByText("Prêt")).toBeVisible({ timeout: 60_000 });

  const { data } = await adminClient()
    .from("documents")
    .select("title, original_type, page_count")
    .eq("owner_id", user.id);
  expect(data).toHaveLength(1);
  expect(data![0]).toMatchObject({ original_type: "pdf", page_count: 1 });
  expect(data![0]!.title).toMatch(/^Scan \d{4}-\d{2}-\d{2}$/);
});
