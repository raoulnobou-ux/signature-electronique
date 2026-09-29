"use client";

import { CreditCard, Download, LogOut, Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useTransition } from "react";
import { signOut } from "@/app/(auth)/actions";
import { useInstallPrompt } from "@/components/pwa/pwa";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ShellAccount } from "./types";

export function UserMenu({ account }: { account: ShellAccount }) {
  const t = useTranslations("app.nav");
  const tCommon = useTranslations("common");
  const { resolvedTheme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  const install = useInstallPrompt();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="cursor-pointer rounded-full outline-offset-2"
        aria-label={`${t("profile")} — ${account.name}`}
      >
        <Avatar name={account.name || account.email} src={account.avatarUrl} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-sm font-semibold text-foreground">{account.name}</p>
          <p className="truncate text-xs font-normal">{account.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/parametres">
            <Settings /> {t("settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/abonnement">
            <CreditCard /> {t("billing")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <Sun /> : <Moon />} {tCommon("toggleTheme")}
        </DropdownMenuItem>
        {install && (
          <DropdownMenuItem onSelect={() => void install()}>
            <Download /> {tCommon("installApp")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          disabled={pending}
          onSelect={() => startTransition(() => signOut())}
        >
          <LogOut /> {tCommon("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
