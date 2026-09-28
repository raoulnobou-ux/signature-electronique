import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "./signin-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("metaTitle") };
}

export default async function SignInPage(props: PageProps<"/connexion">) {
  const params = await props.searchParams;
  const t = await getTranslations("auth.signIn");
  const next = typeof params.next === "string" ? params.next : undefined;

  let notice: { tone: "error" | "success"; text: string } | undefined;
  if (params.erreur === "lien-invalide") notice = { tone: "error", text: t("linkInvalid") };
  else if (params.deconnecte) notice = { tone: "success", text: t("signedOut") };

  return <SignInForm next={next} initialNotice={notice} />;
}
