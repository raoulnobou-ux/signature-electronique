"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { passwordStrength } from "@/lib/password";
import { cn } from "@/lib/utils";

type PasswordInputProps = ComponentProps<typeof Input> & {
  /** Affiche la jauge de robustesse sous le champ. */
  showStrength?: boolean;
  value?: string;
};

const barColors = ["bg-destructive", "bg-destructive", "bg-warning", "bg-brand-cyan", "bg-success"];

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ showStrength, value = "", className, ...props }, ref) {
    const t = useTranslations("auth");
    const [visible, setVisible] = useState(false);
    const score = passwordStrength(value);

    return (
      <div className="space-y-2">
        <div className="relative">
          <Input
            ref={ref}
            type={visible ? "text" : "password"}
            className={cn("pr-12", className)}
            value={value}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground"
            aria-label={visible ? t("fields.hidePassword") : t("fields.showPassword")}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {showStrength && value.length > 0 && (
          <div className="flex items-center gap-3" aria-live="polite">
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-300",
                    score >= level ? barColors[score] : "bg-secondary",
                  )}
                />
              ))}
            </div>
            <span className="w-20 text-right text-xs text-muted-foreground">
              {t(`strength.${score}`)}
            </span>
          </div>
        )}
      </div>
    );
  },
);
