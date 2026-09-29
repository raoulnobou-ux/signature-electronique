import "server-only";

export interface LayoutLine {
  page: number; // 1-based
  x: number; // % de la largeur
  y: number; // % de la hauteur (haut de la ligne, origine en haut à gauche)
  text: string;
}

/**
 * Texte d'un PDF avec la position de chaque ligne (en % de la page affichée) : l'assistant
 * s'en sert pour placer les zones de signature au bon endroit (« Signature : », « Le bailleur »…).
 */
export async function extractLayout(
  bytes: Uint8Array,
  maxChars = 40_000,
): Promise<{ lines: LayoutLine[]; pageCount: number; truncated: boolean }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const lines: LayoutLine[] = [];
  let chars = 0;
  let truncated = false;
  try {
    for (let p = 1; p <= doc.numPages && !truncated; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Regroupe les fragments par ligne (même hauteur à ~0,6 % près).
      const rows = new Map<number, { x: number; y: number; parts: { x: number; s: string }[] }>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]) as [
          number,
          number,
        ];
        const fontHeight = Math.hypot(item.transform[2], item.transform[3]);
        const x = (vx / viewport.width) * 100;
        const y = ((vy - fontHeight) / viewport.height) * 100;
        const key = Math.round(y / 0.6);
        const row = rows.get(key) ?? { x, y, parts: [] };
        row.x = Math.min(row.x, x);
        row.parts.push({ x, s: item.str });
        rows.set(key, row);
      }
      for (const row of [...rows.values()].sort((a, b) => a.y - b.y)) {
        const text = row.parts
          .sort((a, b) => a.x - b.x)
          .map((part) => part.s)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        chars += text.length;
        if (chars > maxChars) {
          truncated = true;
          break;
        }
        lines.push({
          page: p,
          x: Math.max(0, Math.round(row.x * 10) / 10),
          y: Math.max(0, Math.round(row.y * 10) / 10),
          text,
        });
      }
    }
    return { lines, pageCount: doc.numPages, truncated };
  } finally {
    await task.destroy();
  }
}

/** Présentation compacte pour le modèle : « p1 y=81.0 x=10.1 | Fait à Douala. Signature : ». */
export function formatLayout(lines: LayoutLine[]): string {
  return lines
    .map((l) => `p${l.page} y=${l.y.toFixed(1)} x=${l.x.toFixed(1)} | ${l.text}`)
    .join("\n");
}
