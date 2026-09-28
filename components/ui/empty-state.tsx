import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/** État vide illustré : icône dans un halo de marque + message + action. */
function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      <div className="relative">
        <div className="absolute -inset-8 -z-10 bg-[radial-gradient(closest-side,rgb(129_140_248/0.3),transparent)]" />
        <div className="flex size-16 items-center justify-center rounded-2xl glass">
          <Icon className="size-7 text-accent-foreground" strokeWidth={1.6} />
        </div>
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export { EmptyState };
