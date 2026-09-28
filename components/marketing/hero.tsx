import { CheckCircle2, Fingerprint, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AmbientBackground } from "@/components/brand/ambient-background";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignedDocumentDemo } from "./signed-document-demo";

export async function Hero() {
  const t = await getTranslations("landing.hero");
  const reassurances = [
    { icon: Wallet, label: t("reassurance1") },
    { icon: Smartphone, label: t("reassurance2") },
    { icon: ShieldCheck, label: t("reassurance3") },
  ];

  return (
    <section className="relative isolate overflow-hidden">
      <AmbientBackground grid />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28">
        <div className="space-y-7 text-center lg:text-left">
          <Badge variant="outline" className="glass px-3 py-1 text-foreground">
            <span className="size-1.5 rounded-full bg-brand-cyan shadow-[0_0_10px_var(--brand-cyan)]" />
            {t("badge")}
          </Badge>
          <h1 className="font-display text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[4.1rem]">
            {t("titleStart")} <span className="text-gradient">{t("titleHighlight")}</span>
          </h1>
          <p className="mx-auto max-w-xl text-base text-pretty text-muted-foreground sm:text-lg lg:mx-0">
            {t("subtitle")}
          </p>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild size="lg">
              <Link href="/inscription">{t("ctaPrimary")}</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="#comment-ca-marche">{t("ctaSecondary")}</Link>
            </Button>
          </div>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground lg:justify-start">
            {reassurances.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="size-4 text-accent-foreground" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <SignedDocumentDemo
          labels={{
            title: t("demoDocTitle"),
            meta: t("demoDocMeta"),
            signed: t("demoSigned"),
            signedAt: t("demoSignedAt"),
            signer: t("demoSigner"),
            stamp: t("demoStamp"),
            hash: t("demoHash"),
          }}
          icons={{
            check: <CheckCircle2 className="size-3.5" />,
            hash: <Fingerprint className="size-3.5" />,
          }}
        />
      </div>
    </section>
  );
}
