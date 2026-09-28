import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// Page provisoire — remplacée par le parcours d'authentification (Phase 3).
export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <h1 className="font-display text-3xl font-semibold">Bientôt disponible</h1>
      <Button asChild variant="secondary">
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </main>
  );
}
