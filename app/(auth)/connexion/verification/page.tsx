import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mfaPending } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { MfaForm } from "./mfa-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.mfa");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Deuxième étape de connexion d'un compte protégé par la double authentification. */
export default async function MfaPage(props: PageProps<"/connexion/verification">) {
  const params = await props.searchParams;
  // Session déjà vérifiée (ou compte sans 2FA) : rien à saisir.
  if (!(await mfaPending(await createClient()))) redirect("/app");
  return <MfaForm next={typeof params.next === "string" ? params.next : undefined} />;
}
