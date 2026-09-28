import { isIP } from "node:net";

/**
 * Adresses interdites pour les requêtes sortantes (protection SSRF) :
 * boucle locale, réseaux privés, lien-local (dont métadonnées cloud 169.254.169.254),
 * CGNAT, multicast, réservées, et leurs équivalents IPv6 / IPv4 mappées.
 */
export function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number) as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // lien-local, métadonnées cloud
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return false; // tests de performance
  if (a >= 224) return false; // multicast et réservé
  return true;
}

function isPublicIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return false;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]!);
  if (/^fe[89ab]/.test(lower)) return false; // lien-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false; // adresses uniques locales
  if (lower.startsWith("ff")) return false; // multicast
  if (lower.startsWith("64:ff9b:")) return false; // NAT64
  return true;
}
