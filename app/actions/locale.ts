"use server";

import { isLocale } from "@/i18n/config";
import { setLocaleCookie } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

/** Change la langue de l'interface ; enregistrée aussi dans le profil (e-mails, assistant). */
export async function changeLocale(locale: unknown): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  await setLocaleCookie(locale);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("profiles").update({ locale }).eq("id", user.id);
    // Métadonnées lues par les e-mails d'authentification (réinitialisation…).
    await supabase.auth.updateUser({ data: { locale } });
  }
  return { ok: true };
}
