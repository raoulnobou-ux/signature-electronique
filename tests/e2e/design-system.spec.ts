import { expect, test } from "@playwright/test";

test("la page /design affiche le design system sans erreur console", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/design");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("QuickSign");

  await page.getByRole("button", { name: "Ouvrir une modale" }).click();
  await expect(page.getByRole("dialog")).toContainText("Finaliser et signer");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  expect(errors).toEqual([]);
});
