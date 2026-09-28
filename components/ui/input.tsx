import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const fieldBase = [
  "w-full rounded-xl border border-input bg-background-elevated/60 px-3.5 text-base text-foreground sm:text-sm",
  "placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] duration-200",
  "hover:border-ring/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
].join(" ");

function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input type={type} data-slot="input" className={cn(fieldBase, "h-11", className)} {...props} />
  );
}

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldBase, "min-h-24 resize-y py-3", className)}
      {...props}
    />
  );
}

export { fieldBase, Input, Textarea };
