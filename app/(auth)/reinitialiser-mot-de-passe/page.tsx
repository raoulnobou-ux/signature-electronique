import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "./reset-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
