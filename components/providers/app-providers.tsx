"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/components/pwa/pwa";

/**
 * Fournisseur global, volontairement minimal pour garder les pages publiques légères :
 * uniquement le thème. Les autres fournisseurs (données, animations, toasts,
 * infobulles) sont dans AppShellProviders, chargés par l'application connectée.
 */
export function AppProviders({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
      <ServiceWorkerRegistration />
    </ThemeProvider>
  );
}
