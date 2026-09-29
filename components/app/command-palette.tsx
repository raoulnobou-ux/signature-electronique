"use client";

import { FilePlus2, LogOut, Moon, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useOptionalAssistant } from "@/components/assistant/assistant-context";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { NAV_ITEMS, SECONDARY_NAV } from "@/lib/navigation";

/** Palette de commandes globale (Ctrl/Cmd + K) : pages, actions, et question à l'assistant. */
export function CommandPalette() {
  const t = useTranslations("app");
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const ta = useTranslations("assistant");
  const assistant = useOptionalAssistant();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("quicksign:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("quicksign:open-palette", onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="hidden w-64 justify-start text-muted-foreground md:inline-flex"
        onClick={() => setOpen(true)}
        data-tour="search"
      >
        <Search /> <span className="flex-1 text-left">{t("nav.search")}</span>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} label={t("nav.search")}>
        <CommandInput
          placeholder={t("palette.placeholder")}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!assistant && <CommandEmpty>{t("palette.empty")}</CommandEmpty>}
          {assistant && (
            <CommandGroup heading={ta("title")} forceMount>
              <CommandItem
                forceMount
                value={`assistant ${query}`}
                data-testid="palette-assistant"
                onSelect={() => {
                  setOpen(false);
                  const message = query.trim();
                  setQuery("");
                  assistant.ask(message ? { message } : undefined);
                }}
              >
                <Sparkles /> {query.trim() ? ta("paletteAsk", { query: query.trim() }) : ta("open")}
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading={t("palette.actions")}>
            <CommandItem onSelect={() => go("/app/documents?importer=1")}>
              <FilePlus2 /> {t("dashboard.quick.sign")}
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                setOpen(false);
              }}
            >
              <Moon /> {t("palette.toggleTheme")}
            </CommandItem>
            <CommandItem onSelect={() => signOut()}>
              <LogOut /> {t("palette.signOut")}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t("palette.pages")}>
            {[...NAV_ITEMS, ...SECONDARY_NAV].map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.key} onSelect={() => go(item.href)}>
                  <Icon /> {t(`nav.${item.key}`)}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
