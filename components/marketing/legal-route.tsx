import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LEGAL_UPDATED_AT } from "@/config/legal";
import { isLocale } from "@/i18n/config";
import type { LegalDoc } from "@/content/legal/types";
import { LegalPage } from "./legal-page";

async function pick(doc: LegalDoc) {
  const locale = await getLocale();
  return { locale: isLocale(locale) ? locale : "fr", ...doc[isLocale(locale) ? locale : "fr"] };
}

/** Métadonnées d'une page juridique dans la langue du visiteur. */
export async function legalMetadata(doc: LegalDoc): Promise<Metadata> {
  const { title, description } = await pick(doc);
  return { title, description };
}

/** Page juridique dans la langue du visiteur (français ou anglais). */
export async function LegalRoute({ doc }: { doc: LegalDoc }) {
  const { locale, title, body } = await pick(doc);
  return (
    <LegalPage title={title} updatedAt={LEGAL_UPDATED_AT[locale]} translated>
      {body}
    </LegalPage>
  );
}
