import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

type Messages = Awaited<ReturnType<typeof getMessages>>;

/** Espaces de noms toujours disponibles côté client. */
const BASE_NAMESPACES = ["common", "validation"] as const;

/**
 * Transmet au navigateur uniquement les traductions nécessaires (les pages publiques
 * restent légères). `namespaces` accepte des chemins pointés : "landing.pricing".
 */
export async function ClientMessages({
  namespaces = [],
  children,
}: {
  namespaces?: string[];
  children: ReactNode;
}) {
  const all = await getMessages();
  const picked: Record<string, unknown> = {};

  for (const path of [...BASE_NAMESPACES, ...namespaces]) {
    const keys = path.split(".");
    let source: unknown = all;
    let target: Record<string, unknown> = picked;
    keys.forEach((key, i) => {
      source = (source as Record<string, unknown> | undefined)?.[key];
      if (i === keys.length - 1) target[key] = source;
      else target = (target[key] ??= {}) as Record<string, unknown>;
    });
  }

  return <NextIntlClientProvider messages={picked as Messages}>{children}</NextIntlClientProvider>;
}
