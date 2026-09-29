import { Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Encart d'une fonctionnalité Pro pour un compte Essentiel (ou expiré). */
export function ProUpsell({
  icon: Icon,
  title,
  text,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  cta: string;
}) {
  return (
    <div className="gradient-border relative overflow-hidden rounded-3xl glass p-8 text-center sm:p-12">
      <div
        aria-hidden
        className="absolute inset-x-0 -top-24 -z-10 mx-auto h-48 w-2/3 bg-[radial-gradient(closest-side,rgb(139_92_246/0.35),transparent)]"
      />
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-lift">
        <Icon className="size-7" aria-hidden />
      </div>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-muted-foreground">{text}</p>
      <Button asChild size="lg" className="mt-6">
        <Link href="/app/abonnement#plans">
          <Sparkles /> {cta}
        </Link>
      </Button>
    </div>
  );
}
