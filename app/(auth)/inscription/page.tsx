import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignUpForm } from "./signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("metaTitle") };
}

export default function SignUpPage() {
  return <SignUpForm />;
}
