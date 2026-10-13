import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShellProviders } from "@/components/providers/app-shell-providers";
import { DesignSystemShowcase } from "./showcase";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/** Vitrine interne des composants : développement et préproduction seulement. */
export default function DesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return (
    <AppShellProviders>
      <DesignSystemShowcase />
    </AppShellProviders>
  );
}
