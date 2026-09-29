"use client";

import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/** Bascule sombre / clair. Les deux icônes sont rendues ; le CSS choisit (pas de flash à l'hydratation). */
export function ThemeToggle({ className }: { className?: string }) {
  const tc = useTranslations("common");
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={tc("toggleTheme")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="block dark:hidden" />
    </Button>
  );
}
