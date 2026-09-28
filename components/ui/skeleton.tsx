import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Squelette de chargement à reflet animé — jamais de spinner brut. */
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("skeleton-shimmer rounded-xl", className)} {...props} />;
}

export { Skeleton };
