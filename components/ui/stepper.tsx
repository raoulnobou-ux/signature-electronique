import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type StepperProps = {
  steps: string[];
  /** Index (0-based) de l'étape en cours. */
  current: number;
  className?: string;
};

/** Indicateur d'étapes : barre de progression + libellés (inscription, onboarding). */
function Stepper({ steps, current, className }: StepperProps) {
  const tc = useTranslations("common");
  return (
    <ol className={cn("flex w-full items-center gap-2", className)} aria-label={tc("progress")}>
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            className="flex flex-1 flex-col gap-2"
            aria-current={active ? "step" : undefined}
          >
            <div className="h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full bg-brand-gradient transition-[width] duration-500 ease-out",
                  done || active ? "w-full" : "w-0",
                  active && "opacity-80",
                )}
              />
            </div>
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {done && <Check className="size-3.5 text-success" />}
              <span className="sr-only">Étape {index + 1} : </span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export { Stepper };
