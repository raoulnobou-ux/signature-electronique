import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** Libellé + champ + aide + erreur, reliés pour les lecteurs d'écran. */
export function FormField({
  id,
  label,
  error,
  hint,
  children,
  labelAction,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  labelAction?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
