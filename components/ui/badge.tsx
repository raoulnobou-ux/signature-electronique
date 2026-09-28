import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-accent-foreground",
        outline: "border-border text-muted-foreground",
        brand: "border-transparent bg-brand-gradient text-white",
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/25 bg-warning/10 text-warning",
        danger: "border-destructive/25 bg-destructive/10 text-destructive",
        muted: "border-transparent bg-secondary text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean };

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Statuts de documents et de signataires, avec couleur et libellé cohérents partout. */
const STATUS_STYLES = {
  draft: { variant: "muted", label: "Brouillon" },
  pending: { variant: "warning", label: "En attente" },
  sent: { variant: "default", label: "Envoyé" },
  opened: { variant: "default", label: "Ouvert" },
  signed: { variant: "success", label: "Signé" },
  completed: { variant: "success", label: "Terminé" },
  declined: { variant: "danger", label: "Refusé" },
  expired: { variant: "outline", label: "Expiré" },
  canceled: { variant: "outline", label: "Annulé" },
} as const satisfies Record<string, { variant: NonNullable<BadgeProps["variant"]>; label: string }>;

type Status = keyof typeof STATUS_STYLES;

function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const style = STATUS_STYLES[status];
  return (
    <Badge variant={style.variant} dot className={className}>
      {style.label}
    </Badge>
  );
}

export { Badge, badgeVariants, StatusBadge };
export type { Status };
