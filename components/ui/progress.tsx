"use client";

import { Progress as ProgressPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root> & { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root
      value={clamped}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full rounded-full bg-brand-gradient transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
