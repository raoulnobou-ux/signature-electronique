import { cn } from "@/lib/utils";

/**
 * Fond d'ambiance : blobs flous aux couleurs de la marque qui dérivent très lentement.
 * Purement décoratif (aria-hidden), coupé si l'utilisateur préfère le mouvement réduit.
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
    intensity === "subtle" ? "opacity-[0.18] dark:opacity-25" : "opacity-30 dark:opacity-45";
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
          "absolute -top-[20%] left-[8%] size-[42rem] max-w-[120vw] animate-blob rounded-full bg-[#6366F1] blur-[120px]",
          opacity,
        )}
      />
      <div
        className={cn(
          "absolute top-[5%] right-[-10%] size-[34rem] max-w-[100vw] animate-blob rounded-full bg-[#8B5CF6] blur-[120px] [animation-delay:-9s]",
          opacity,
        )}
      />
      <div
        className={cn(
          "absolute top-[40%] left-[35%] size-[28rem] max-w-[90vw] animate-blob rounded-full bg-[#22D3EE] blur-[130px] [animation-delay:-17s]",
          intensity === "subtle" ? "opacity-10 dark:opacity-15" : "opacity-20 dark:opacity-25",
        )}
      />
    </div>
  );
}
