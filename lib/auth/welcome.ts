import "server-only";
import { toLocale } from "@/i18n/config";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";

/** Envoie l'e-mail de bienvenue une seule fois par compte (marquage atomique en base). */
export async function sendWelcomeOnce(userId: string) {
  const { data: profile } = await createAdminClient()
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", userId)
    .is("welcome_email_sent_at", null)
    .select("full_name, email, locale")
    .maybeSingle();
  if (!profile?.email) return;
  await sendEmail({
    to: profile.email,
    ...welcomeEmail({ fullName: profile.full_name, locale: toLocale(profile.locale) }),
  });
}
