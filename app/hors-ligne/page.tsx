import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { ReloadButton } from "@/components/pwa/reload-button";

export const metadata: Metadata = { title: "Hors ligne · Offline", robots: { index: false } };
export const dynamic = "force-static";

/** Affichée par le service worker quand le réseau est coupé (bilingue : page mise en cache). */
export default function OfflinePage() {
  return (
    <main id="contenu" className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-5">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-secondary">
          <WifiOff className="size-7 text-muted-foreground" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold">Pas de connexion</h1>
          <p className="text-muted-foreground">
            Vérifiez votre réseau, puis réessayez. Vos documents sont en sécurité et vous attendent.
          </p>
        </div>
        <div className="space-y-2" lang="en">
          <h2 className="font-display text-lg font-semibold">No connection</h2>
          <p className="text-sm text-muted-foreground">Check your network, then try again. Your documents are safe.</p>
        </div>
        <ReloadButton />
      </div>
    </main>
  );
}
