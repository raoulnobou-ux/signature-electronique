import "server-only";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { isPublicIp } from "@/lib/net/ip";
import { MAX_UPLOAD_BYTES } from "./limits";

export class FetchUrlError extends Error {
  constructor(
    public code: "invalid_url" | "blocked" | "not_found" | "too_large" | "timeout" | "failed",
  ) {
    super(code);
  }
}

/**
 * Transforme les liens de partage courants en liens de téléchargement direct
 * (Google Drive, Dropbox, OneDrive).
 */
export function normalizeShareUrl(input: string): string {
  const url = new URL(input);
  const drive = url.pathname.match(/^\/file\/d\/([\w-]+)/);
  if (url.hostname === "drive.google.com" && drive) {
    return `https://drive.google.com/uc?export=download&id=${drive[1]}`;
  }
  if (url.hostname.endsWith("dropbox.com")) {
    url.searchParams.set("dl", "1");
    return url.toString();
  }
  if (url.hostname === "1drv.ms" || url.hostname.endsWith("onedrive.live.com")) {
    url.searchParams.set("download", "1");
    return url.toString();
  }
  return url.toString();
}

/**
 * Le contrôle d'adresse se fait au moment de la connexion (résolution DNS incluse) :
 * impossible de contourner la vérification par rebinding DNS ou par redirection.
 */
const safeAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "", 4);
        const list = Array.isArray(addresses)
          ? addresses
          : [{ address: addresses as unknown as string, family: 4 }];
        const blocked = list.find((a) => !isPublicIp(a.address));
        if (blocked || list.length === 0) return callback(new FetchUrlError("blocked"), "", 4);
        const first = list[0]!;
        callback(null, first.address, first.family);
      });
    },
  },
});

/** Protocole, identifiants et adresse IP littérale (non vue par la résolution DNS). */
export function assertAllowedUrl(url: URL): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchUrlError("invalid_url");
  if (url.username || url.password) throw new FetchUrlError("invalid_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicIp(host)) throw new FetchUrlError("blocked");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    throw new FetchUrlError("blocked");
}

/** Télécharge un document depuis un lien public, avec limites de taille et de durée. */
export async function fetchDocumentFromUrl(
  input: string,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  let url: URL;
  try {
    url = new URL(normalizeShareUrl(input.trim()));
  } catch {
    throw new FetchUrlError("invalid_url");
  }

  // Redirections suivies manuellement : chaque étape est revérifiée (IP littérale comprise,
  // que la résolution DNS de l'agent ne voit pas).
  let response: Awaited<ReturnType<typeof undiciFetch>>;
  for (let hops = 0; ; hops++) {
    assertAllowedUrl(url);
    try {
      response = await undiciFetch(url, {
        dispatcher: safeAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: { "User-Agent": "QuickSign/1.0 (+https://quicksign.app)" },
      });
    } catch (error) {
      const cause = (error as { cause?: unknown }).cause;
      if (cause instanceof FetchUrlError || error instanceof FetchUrlError)
        throw new FetchUrlError("blocked");
      if (error instanceof Error && error.name === "TimeoutError")
        throw new FetchUrlError("timeout");
      throw new FetchUrlError("failed");
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      if (hops >= 5) throw new FetchUrlError("failed");
      url = new URL(location, url);
      continue;
    }
    break;
  }

  if (response.status === 404 || response.status === 403) throw new FetchUrlError("not_found");
  if (!response.ok || !response.body) throw new FetchUrlError("failed");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) throw new FetchUrlError("too_large");

  // Lecture en flux avec plafond : on n'accepte jamais plus que la taille maximale.
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_UPLOAD_BYTES) throw new FetchUrlError("too_large");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const fromHeader = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  const fromPath = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  const fileName = (fromHeader ? decodeURIComponent(fromHeader) : fromPath) || "document";
  return { bytes, fileName };
}
