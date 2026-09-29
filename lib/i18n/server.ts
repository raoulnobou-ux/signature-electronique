import "server-only";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

/** Pose le cookie de langue (1 an) : lu par i18n/request.ts à chaque requête. */
export async function setLocaleCookie(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 365 * 86_400,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/** Reprend la langue enregistrée dans le profil (autre appareil, autre navigateur). */
export async function applyProfileLocale(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("locale").eq("id", userId).maybeSingle();
  if (isLocale(data?.locale)) await setLocaleCookie(data.locale);
}
