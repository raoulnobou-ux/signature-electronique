"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { changeLocale } from "@/app/actions/locale";
import { locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English" };

/** Bascule FR / EN : cookie + profil, puis rechargement des composants serveur. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div
      className={cn("inline-flex items-center gap-1 text-sm", className)}
      role="group"
      aria-label="Langue / Language"
    >
      <Languages className="size-4 text-muted-foreground" aria-hidden />
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          disabled={pending}
          aria-pressed={l === locale}
          onClick={() =>
            start(async () => {
              if (l === locale) return;
              await changeLocale(l);
              router.refresh();
            })
          }
          className={cn(
            "cursor-pointer rounded-md px-1.5 py-0.5 transition-colors hover:text-foreground",
            l === locale ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
