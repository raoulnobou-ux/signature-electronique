import { cva, type VariantProps } from "class-variance-authority";
import { useTranslations } from "next-intl";
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
  draft: "muted",
  pending: "warning",
  sent: "default",
  opened: "default",
  signed: "success",
  completed: "success",
  declined: "danger",
  expired: "outline",
  canceled: "outline",
} as const satisfies Record<string, NonNullable<BadgeProps["variant"]>>;

type Status = keyof typeof STATUS_STYLES;

function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const t = useTranslations("common.status");
  return (
    <Badge variant={STATUS_STYLES[status]} dot className={className}>
      {t(status)}
    </Badge>
  );
}

export { Badge, badgeVariants, StatusBadge };
export type { Status };
