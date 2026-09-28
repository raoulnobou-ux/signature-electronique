"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn, initials } from "@/lib/utils";

type AvatarProps = ComponentProps<typeof AvatarPrimitive.Root> & {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
};

const sizes = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-16 text-lg" };

function Avatar({ name, src, size = "md", className, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full",
        sizes[size],
        className,
      )}
      {...props}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center bg-brand-gradient font-display font-semibold text-white"
        delayMs={src ? 400 : 0}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export { Avatar };
