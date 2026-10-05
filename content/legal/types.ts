import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";

/** Page juridique traduite : titre, description (métadonnées) et contenu. */
export type LegalDoc = Record<Locale, { title: string; description: string; body: ReactNode }>;
