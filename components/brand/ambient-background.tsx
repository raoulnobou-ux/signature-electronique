import { cn } from "@/lib/utils";

/**
 * Fond d'ambiance : halos aux couleurs de la marque qui dérivent très lentement.
 * Dégradés radiaux plutôt que des filtres « blur » : rendu identique, coût de peinture
 * bien plus faible sur les téléphones d'entrée de gamme. Décoratif (aria-hidden),
 * immobile si l'utilisateur préfère le mouvement réduit.
 */
export function AmbientBackground({
  className,
  grid = false,
  intensity = "normal",
}: {
  className?: string;
  grid?: boolean;
  intensity?: "subtle" | "normal";
}) {
  const opacity =
    intensity === "subtle" ? "opacity-40 dark:opacity-50" : "opacity-60 dark:opacity-80";
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
    >
      {grid && (
        <div className="absolute inset-0 bg-dot-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,#000_40%,transparent_100%)]" />
      )}
      <div
        className={cn(
          "absolute -top-[30%] -left-[10%] size-[56rem] max-w-[150vw] animate-blob rounded-full bg-[radial-gradient(circle,rgb(99_102_241/0.55)_0%,transparent_65%)] will-change-transform",
          opacity,
        )}
      />
      <div
        className={cn(
          "absolute -top-[10%] -right-[25%] size-[48rem] max-w-[130vw] animate-blob rounded-full bg-[radial-gradient(circle,rgb(139_92_246/0.5)_0%,transparent_65%)] will-change-transform [animation-delay:-9s]",
          opacity,
        )}
      />
      <div
        className={cn(
          "absolute top-[35%] left-[25%] hidden size-[40rem] animate-blob rounded-full bg-[radial-gradient(circle,rgb(34_211_238/0.35)_0%,transparent_65%)] will-change-transform [animation-delay:-17s] sm:block",
          opacity,
        )}
      />
    </div>
  );
}
