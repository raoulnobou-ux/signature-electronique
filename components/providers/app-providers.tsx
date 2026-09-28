"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Fournisseur global, volontairement minimal pour garder les pages publiques légères :
 * uniquement le thème. Les autres fournisseurs (données, animations, toasts,
 * infobulles) sont dans AppShellProviders, chargés par l'application connectée.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
