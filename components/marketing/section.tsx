import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** En-tête de section standard : sur-titre, titre, sous-titre. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  id,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  id?: string;
}) {
  return (
    <div className={cn("reveal max-w-2xl space-y-3", align === "center" && "mx-auto text-center")}>
      <p className="text-sm font-semibold tracking-wide text-accent-foreground uppercase">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-base text-pretty text-muted-foreground sm:text-lg">{subtitle}</p>
      )}
    </div>
  );
}

export function Section({
  id,
  className,
  children,
  labelledBy,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "relative mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28",
        className,
      )}
    >
      {children}
    </section>
  );
}
