"use client";

import { ChevronDown } from "lucide-react";
import { useLocale } from "next-intl";
import { forwardRef, useMemo, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { countryOptions, flagEmoji, type CountryCode } from "@/lib/phone";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";

type PhoneInputProps = Omit<ComponentProps<"input">, "onChange" | "value"> & {
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
  value: string;
  onValueChange: (value: string) => void;
  countryLabel: string;
};

/**
 * Sélecteur de pays (select natif : léger, parfait au doigt) + numéro national.
 * Le Cameroun (+237) est proposé par défaut ; la normalisation E.164 se fait à la validation.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { country, onCountryChange, value, onValueChange, countryLabel, className, ...props },
  ref,
) {
  const locale = useLocale();
  const isClient = useIsClient();
  // Les noms de pays dépendent des données ICU (Node ≠ navigateur) : liste complète côté client seulement.
  const options = useMemo(() => countryOptions(locale), [locale]);
  const visibleOptions = isClient ? options : options.filter((o) => o.code === country);
  const current = options.find((o) => o.code === country);
  const firstOther = options.findIndex((o) => !o.favorite);

  return (
    <div className="flex gap-2">
      <div className="relative shrink-0">
        <select
          aria-label={countryLabel}
          value={country}
          onChange={(e) => onCountryChange(e.target.value as CountryCode)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {visibleOptions.map((o) => (
            <option key={o.code} value={o.code}>
              {isClient && options.indexOf(o) === firstOther ? "── " : ""}
              {isClient ? o.name : o.code} ({o.dialCode})
            </option>
          ))}
        </select>
        <div
          aria-hidden
          className="pointer-events-none flex h-11 items-center gap-1.5 rounded-xl border border-input bg-background-elevated/60 px-3 text-sm"
        >
          <span className="text-lg leading-none">{flagEmoji(country)}</span>
          <span className="tabular-nums">{current?.dialCode}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </div>
      </div>
      <Input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn("flex-1", className)}
        {...props}
      />
    </div>
  );
});
