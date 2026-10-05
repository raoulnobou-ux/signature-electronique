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

/**
 * Accès du compte de test :
 * - pro (défaut) : abonnement Pro actif 30 jours, pour tester les fonctionnalités ;
 * - free : accès gratuit d'un nouveau compte (inscription) ;
 * - trial : ancien essai de 6 jours encore en cours (comptes créés avant l'accès gratuit).
 */
export type TestAccess = "pro" | "free" | "trial";

const DAY = 86_400_000;

/** Crée un compte confirmé (sans passer par l'e-mail) et renvoie ses identifiants. */
export async function createConfirmedUser(
  prefix = "user",
  fullName = "Awa Nkeng",
  access: TestAccess = "pro",
) {
  const email = uniqueEmail(prefix);
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: "+237690123456" },
  });
  if (error || !data.user) throw error ?? new Error("création impossible");
  if (access !== "free") {
    const now = Date.now();
    const { error: subError } = await admin
      .from("subscriptions")
      .update(
        access === "pro"
          ? {
              plan: "pro",
              status: "active",
              billing_cycle: "monthly",
              currency: "XAF",
              current_period_start: new Date(now).toISOString(),
              current_period_end: new Date(now + 30 * DAY).toISOString(),
            }
          : {
              plan: "trial",
              status: "trialing",
              current_period_start: new Date(now).toISOString(),
              current_period_end: new Date(now + 6 * DAY).toISOString(),
            },
      )
      .eq("user_id", data.user.id);
    if (subError) throw subError;
  }
  return { email, id: data.user.id };
}

export async function signInAs(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/app/);
}
