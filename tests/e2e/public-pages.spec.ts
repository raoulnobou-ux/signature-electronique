import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", heading: /Signez, faites signer, terminé/ },
  { path: "/tarifs", heading: /Un prix juste/ },
  { path: "/securite", heading: /Vos documents sont en sécurité/ },
  { path: "/contact", heading: /Parlons de votre structure/ },
  { path: "/cgu", heading: /Conditions générales/ },
  { path: "/confidentialite", heading: /Politique de confidentialité/ },
  { path: "/mentions-legales", heading: /Mentions légales/ },
];

for (const { path, heading } of pages) {
  test(`${path} s'affiche sans erreur ni débordement horizontal`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("les tarifs basculent en annuel et dans chaque devise", async ({ page }) => {
  await page.goto("/tarifs");
  await page.getByRole("radio", { name: /FCFA/ }).click();
  await expect(page.getByText("5 000 FCFA").first()).toBeVisible();
  await page.getByRole("radio", { name: /Annuel/ }).click();
  await expect(page.getByText("50 000 FCFA").first()).toBeVisible();
  await page.getByRole("radio", { name: "USD" }).click();
  await expect(page.getByText("100 $").first()).toBeVisible();
  await page.getByRole("radio", { name: "EUR" }).click();
  await expect(page.getByText("90 €").first()).toBeVisible();
  await page.getByRole("radio", { name: "GBP" }).click();
  await expect(page.getByText("80 £").first()).toBeVisible();
});

test("le formulaire de contact valide puis envoie le message", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(page.getByText("Trop court.").first()).toBeVisible();

  await page.getByLabel("Nom complet").fill("Awa Test");
  await page.getByLabel("Adresse e-mail").fill("awa@example.com");
  await page
    .getByLabel("Votre message")
    .fill("Bonjour, je voudrais une démonstration pour mon cabinet.");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(page.getByRole("status")).toContainText("Message envoyé");
});

test("la FAQ s'ouvre au clic", async ({ page }) => {
  await page.goto("/#faq");
  const question = page.getByText(/carte bancaire pour créer un compte/);
  await question.click();
  await expect(page.getByText(/Le compte est gratuit et sans carte/)).toBeVisible();
});

test("pied de page : réseaux sociaux, support et liens légaux sur chaque page publique", async ({
  page,
}) => {
  for (const { path } of pages) {
    await page.goto(path);
    const footer = page.getByRole("contentinfo");
    const socials = footer.getByRole("list", { name: "Suivez QuickSign" });
    await expect(socials.getByRole("link")).toHaveCount(5);
    for (const [name, url] of [
      ["LinkedIn", "https://www.linkedin.com/in/quicksign-app-5b0546440"],
      ["X (Twitter)", "https://x.com/Quicksignapp"],
      ["Instagram", "https://www.instagram.com/quicksignapp/"],
      ["TikTok", "https://www.tiktok.com/@quicksignapp"],
    ] as const) {
      const link = socials.getByRole("link", { name });
      await expect(link).toHaveAttribute("href", url);
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    await expect(
      footer.getByRole("link", { name: "supportquicksignapp@gmail.com" }),
    ).toHaveAttribute("href", "mailto:supportquicksignapp@gmail.com");
    for (const [name, href] of [
      ["Conditions générales", "/cgu"],
      ["Confidentialité", "/confidentialite"],
      ["Mentions légales", "/mentions-legales"],
      ["Sécurité et confidentialité", "/securite"],
    ] as const) {
      await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
  }
});
