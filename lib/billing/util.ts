import { timingSafeEqual } from "node:crypto";

/** Comparaison en temps constant (signatures, jetons). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
