"use client";

import { useTranslations } from "next-intl";

type ValidationKey =
  | "required"
  | "email"
  | "tooShort"
  | "tooLong"
  | "phone"
  | "passwordPolicy"
  | "acceptTerms"
  | "passwordMismatch"
  | "samePassword";

/** Traduit une clé d'erreur de validation (zod ou serveur) ; texte générique si inconnue. */
export function useValidationMessage() {
  const t = useTranslations("validation");
  return (key: string | undefined) => {
    if (!key) return undefined;
    return t.has(key as ValidationKey) ? t(key as ValidationKey) : t("required");
  };
}
