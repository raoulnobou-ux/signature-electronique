import { expect, test } from "@playwright/test";
import { adminClient, createConfirmedUser, signInAs } from "./helpers/accounts";
import { uniqueEmail, waitForEmail } from "./helpers/mailpit";

test.describe("anglais", () => {
  test("un navigateur anglophone voit le site en anglais", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Sign, get it signed, done.",
    );
    await page.goto("/tarifs");
    await expect(page.getByText("Compare plans")).toBeVisible();
    await page.goto("/securite");
    await expect(page.getByRole("heading", { name: "Legal validity" })).toBeVisible();
    // Pages juridiques traduites (plus d'avertissement « en français seulement »).
    for (const [path, title] of [
      ["/confidentialite", "Privacy policy"],
      ["/cgu", "Terms of use and sale"],
      ["/cookies", "Cookie policy"],
      ["/mentions-legales", "Legal notice"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("available in French only")).toHaveCount(0);
    }
    await context.close();
  });

  test("bascule FR → EN depuis le pied de page, inscription et e-mail en anglais", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/inscription");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    const email = uniqueEmail("english");
    await page.getByLabel("Full name").fill("John Mbarga");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("textbox", { name: "Phone" }).fill("6 90 12 34 56");
    await page.getByLabel("Password", { exact: true }).fill("Test-Password-2026");
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    const mail = await waitForEmail(email, "Confirm your email");
    expect(mail.html).toContain("Welcome to QuickSign!");
    expect(mail.html).toContain('lang="en"');
    const { data } = await adminClient()
      .from("profiles")
      .select("locale, terms_version, terms_accepted_at")
      .eq("email", email)
      .single();
    expect(data?.locale).toBe("en");
    // Consentement aux CGU et à la politique de confidentialité : version et date gardées.
    expect(data?.terms_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data?.terms_accepted_at).toBeTruthy();
  });

  test("application en anglais : langue du profil appliquée à la connexion", async ({ page }) => {
    const user = await createConfirmedUser("en-app", "John Mbarga");
    await adminClient().from("profiles").update({ locale: "en" }).eq("id", user.id);
    await signInAs(page, user.email);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Good (morning|afternoon|evening)/,
    );
    await page.goto("/app/documents");
    await expect(page.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible();
    await expect(page.getByPlaceholder("Search for a document…")).toBeVisible();
    // Retour au français depuis les paramètres.
    await page.goto("/app/parametres");
    await page.getByLabel("Language").selectOption("fr");
    await expect(page.getByRole("heading", { name: "Paramètres" })).toBeVisible({
      timeout: 10_000,
    });
    const { data } = await adminClient()
      .from("profiles")
      .select("locale")
      .eq("id", user.id)
      .single();
    expect(data?.locale).toBe("fr");
  });
});
