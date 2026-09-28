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

    let response: Response;
    try {
      response = await fetch(
        `${serverEnv.GOTENBERG_URL.replace(/\/$/, "")}/forms/libreoffice/convert`,
        {
          method: "POST",
          body: form,
          headers,
          signal: AbortSignal.timeout(90_000),
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError")
        throw new ConversionError("timeout");
      throw new ConversionError("failed");
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
