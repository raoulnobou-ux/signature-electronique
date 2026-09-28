"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

/** Notifications éphémères (toasts), stylées selon la DA. Usage : `toast.success("…")`. */
function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border !border-card-border !bg-popover !text-foreground !shadow-lift !font-sans",
          description: "!text-muted-foreground",
          actionButton: "!bg-brand-gradient !text-white !rounded-lg",
        },
      }}
    />
  );
}

export { Toaster };
