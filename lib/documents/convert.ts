import "server-only";
import { serverEnv } from "@/lib/env.server";
import type { OfficeFormat } from "./office";

export class ConversionError extends Error {
  constructor(public code: "not_configured" | "failed" | "timeout") {
    super(code);
  }
}

/**
 * Conversion Word/ODT/RTF → PDF.
 * Interface volontairement simple pour pouvoir brancher un autre service
 * (ex. CloudConvert) sans toucher au reste de l'application.
 */
export interface DocumentConverter {
  toPdf(file: Uint8Array, format: OfficeFormat): Promise<Uint8Array>;
}

/** Gotenberg (LibreOffice en conteneur), protégé par authentification basique. */
export const gotenbergConverter: DocumentConverter = {
  async toPdf(file, format) {
    if (!serverEnv.GOTENBERG_URL) throw new ConversionError("not_configured");

    const form = new FormData();
    form.append("files", new Blob([Buffer.from(file)]), `document.${format}`);
    // PDF/A n'est pas imposé : on garde la fidélité maximale à l'original.

    const headers: Record<string, string> = {};
    if (serverEnv.GOTENBERG_TOKEN) {
      headers.Authorization = `Basic ${Buffer.from(`quicksign:${serverEnv.GOTENBERG_TOKEN}`).toString("base64")}`;
    }

    const url = `${serverEnv.GOTENBERG_URL.replace(/\/$/, "")}/forms/libreoffice/convert`;
    const deadline = Date.now() + 90_000;
    const attempt = async () => {
      try {
        return await fetch(url, {
          method: "POST",
          body: form,
          headers,
          signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError")
          throw new ConversionError("timeout");
        throw new ConversionError("failed");
      }
    };

    let response = await attempt();
    // 503 : LibreOffice (re)démarrait (démarrage à froid, redémarrage périodique). Une seule
    // nouvelle tentative, dans le même délai global : le service est alors prêt.
    if (response.status === 503 && deadline - Date.now() > 10_000) {
      await response.body?.cancel().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      response = await attempt();
    }
    if (!response.ok) {
      console.error(
        "[conversion] Gotenberg",
        response.status,
        await response.text().catch(() => ""),
      );
      throw new ConversionError("failed");
    }
    return new Uint8Array(await response.arrayBuffer());
  },
};
