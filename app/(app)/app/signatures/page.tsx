import { PenLine } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/app/coming-soon";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: t("signatures") };
}

export default async function Page() {
  const t = await getTranslations("app.nav");
  return <ComingSoon title={t("signatures")} icon={PenLine} />;
}
