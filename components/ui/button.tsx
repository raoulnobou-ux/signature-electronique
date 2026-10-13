import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap",
    "transition-[background-color,border-color,color,opacity] duration-150 ease-out",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // Action principale : aplat d'encre, une seule par zone.
        default: "bg-primary text-primary-foreground hover:bg-primary/88",
        secondary:
          "border border-border bg-background-elevated text-foreground hover:border-input hover:bg-secondary",
        outline:
          "border border-input bg-transparent text-foreground hover:border-ring/60 hover:bg-secondary",
        ghost: "text-foreground hover:bg-secondary",
        destructive: "bg-destructive text-white hover:bg-destructive/88",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline dark:text-accent-foreground",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-13 px-7 text-base",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Rend l'enfant (ex. un <Link>) avec le style du bouton. */
    asChild?: boolean;
    /** Affiche un indicateur animé et désactive le bouton. */
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <LoadingDots className="absolute inset-0 m-auto" />
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

/** Indicateur de chargement sobre (trois points), utilisé à la place d'un spinner. */
function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center justify-center gap-1", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-current"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

export { Button, buttonVariants, LoadingDots };
export type { ButtonProps };
