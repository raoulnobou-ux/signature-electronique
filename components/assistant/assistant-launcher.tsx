"use client";

import { Maximize2, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAssistant } from "./assistant-context";
import { AssistantWorkspace } from "./assistant-workspace";

/**
 * Bulle flottante (au-dessus de la barre d'onglets sur mobile) et panneau de l'assistant :
 * plein écran sur mobile, tiroir latéral sur ordinateur.
 */
export function AssistantLauncher({
  userName,
  fullscreenRoute,
}: {
  userName: string;
  fullscreenRoute: boolean;
}) {
  const t = useTranslations("assistant");
  const pathname = usePathname();
  const { open, setOpen } = useAssistant();
  // La page dédiée affiche déjà la conversation.
  if (pathname.startsWith("/app/assistant")) return null;

  return (
    <>
      {!fullscreenRoute && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("open")}
          data-testid="assistant-bubble"
          className={cn(
            "fixed right-4 bottom-24 z-40 flex size-13 cursor-pointer items-center justify-center rounded-full bg-brand-gradient text-white shadow-[0_10px_30px_-8px_rgb(99_102_241/0.8)] transition-transform hover:scale-105 active:scale-95 lg:right-8 lg:bottom-8",
            open && "hidden",
          )}
        >
          <Sparkles className="size-6" aria-hidden />
        </button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-lg" data-testid="assistant-panel">
          <SheetHeader className="flex-row items-center gap-3 py-3 pl-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white">
              <Sparkles className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <SheetTitle className="text-base">{t("title")}</SheetTitle>
              <SheetDescription className="text-xs">{t("subtitle")}</SheetDescription>
            </div>
          </SheetHeader>
          <AssistantWorkspace
            userName={userName}
            layout="panel"
            headerExtra={
              <Button variant="ghost" size="icon" asChild aria-label={t("fullPage")}>
                <Link href="/app/assistant" onClick={() => setOpen(false)}>
                  <Maximize2 />
                </Link>
              </Button>
            }
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
