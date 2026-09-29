import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signInAs } from "./helpers/accounts";

/** Toute violation de la CSP (script bloqué, ressource refusée) fait échouer le test. */
function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/i.test(message.text()))
      violations.push(message.text());
  });
  return violations;
}

test("en-têtes de sécurité et CSP à nonce sur les pages", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response!.headers();
  const csp = headers["content-security-policy"]!;
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-powered-by"]).toBeUndefined();
  // Deux requêtes → deux nonces différents.
  const again = (await page.request.get("/")).headers()["content-security-policy"];
  expect(again).not.toBe(csp);
});

test("parcours complet sans violation de CSP (landing, import, visionneuse PDF, éditeur)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const violations = watchCsp(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const user = await createConfirmedUser("csp");
  await signInAs(page, user.email);
  await page.goto("/app/documents?importer=1");
  await page
    .getByTestId("upload-input")
    .setInputFiles(path.join(__dirname, "fixtures", "annonce.pdf"));
  await expect(page.getByRole("dialog").getByText("Prêt")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Signer maintenant" }).click();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await page.goto(page.url() + "/signer");
  await expect(page.getByTestId("page-layer-0")).toBeVisible({ timeout: 20_000 });
  expect(violations).toEqual([]);
});

test("PWA : manifeste, icônes, service worker et page hors ligne", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    short_name: "QuickSign",
    display: "standalone",
    start_url: "/app",
  });
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  await page.goto("/");
  await expect
    .poll(
      () =>
        page.evaluate(
          async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? null,
        ),
      { timeout: 15_000 },
    )
    .toBe("activated");
  // La page hors ligne est mise en cache à l'installation (servie si le réseau est coupé).
  // (Playwright ne coupe pas le réseau des service workers : on vérifie le cache.)
  const cached = await page.evaluate(async () => {
    const response = await caches.match("/hors-ligne");
    return response ? await response.text() : null;
  });
  expect(cached).toContain("Pas de connexion");
  await page.goto("/hors-ligne");
  await expect(page.getByRole("heading", { name: "Pas de connexion" })).toBeVisible();
});
