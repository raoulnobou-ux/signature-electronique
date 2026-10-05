import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DEFAULT_COUNTRY, isCountryCode } from "@/lib/phone";
import { detectCountry } from "@/lib/pricing";
import { SignUpForm } from "./signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("metaTitle") };
}

export default async function SignUpPage() {
  // Pays du visiteur (hébergeur) : indicatif téléphonique et pays du profil préremplis.
  const country = await detectCountry();
  return <SignUpForm defaultCountry={isCountryCode(country) ? country : DEFAULT_COUNTRY} />;
}
