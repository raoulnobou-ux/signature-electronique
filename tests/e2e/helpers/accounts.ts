import { loadEnvConfig } from "@next/env";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { uniqueEmail } from "./mailpit";

loadEnvConfig(process.cwd());

export const TEST_PASSWORD = "Test-Password-2026";

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    },
  );
}

/** Crée un compte confirmé (sans passer par l'e-mail) et renvoie ses identifiants. */
export async function createConfirmedUser(prefix = "user", fullName = "Awa Nkeng") {
  const email = uniqueEmail(prefix);
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: "+237690123456" },
  });
  if (error || !data.user) throw error ?? new Error("création impossible");
  return { email, id: data.user.id };
}

export async function signInAs(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/app/);
}
