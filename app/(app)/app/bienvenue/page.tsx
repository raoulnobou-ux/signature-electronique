import { FileUp, PenLine, Stamp, Sparkles, FileCheck2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { requireAccount } from "@/lib/auth/account";
import { firstName } from "@/lib/utils";
import { completeOnboarding } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.welcome");
  return { title: t("metaTitle") };
}

const STEPS = [
  { key: "signature", icon: PenLine },
  { key: "stamp", icon: Stamp },
  { key: "import", icon: FileUp },
  { key: "sign", icon: FileCheck2 },
] as const;

export default async function WelcomePage() {
  const [account, t] = await Promise.all([requireAccount(), getTranslations("app.welcome")]);
  const name = firstName(account.profile.full_name);

  return (
    <div className="mx-auto max-w-3xl py-4 sm:py-10">
      <div className="mb-10 space-y-4 text-center">
        <div className="relative mx-auto flex size-20 items-center justify-center">
          <div className="absolute -inset-8 bg-[radial-gradient(closest-side,rgb(139_92_246/0.4),transparent)]" />
          <div className="relative flex size-16 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-lift">
            <Sparkles className="size-7" aria-hidden />
          </div>
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {name ? t("title", { name }) : t("titleNoName")}
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground sm:text-lg">{t("subtitle")}</p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map(({ key, icon: Icon }, i) => (
          <li
            key={key}
            className="flex animate-in gap-4 rounded-2xl glass p-5 fill-mode-both fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${150 + i * 90}ms` }}
          >
            <div className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent">
              <Icon className="size-5 text-accent-foreground" aria-hidden />
              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-brand-gradient text-[11px] font-semibold text-white">
                {i + 1}
              </span>
            </div>
            <div>
              <p className="font-display font-semibold">{t(`steps.${key}.title`)}</p>
              <p className="text-sm text-muted-foreground">{t(`steps.${key}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <form action={completeOnboarding.bind(null, "/app/signatures?nouvelle=signature")}>
          <Button type="submit" size="lg" className="w-full sm:w-auto">
            {t("start")}
          </Button>
        </form>
        <form action={completeOnboarding.bind(null, "/app")}>
          <Button type="submit" size="lg" variant="ghost" className="w-full sm:w-auto">
            {t("later")}
          </Button>
        </form>
      </div>
    </div>
  );
}
