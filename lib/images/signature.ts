"use client";

/** Outils image pour les signatures : recadrage automatique et détourage du fond. */

export type TrimmedImage = { canvas: HTMLCanvasElement; width: number; height: number };

/** Recadre un canvas sur ses pixels visibles (+ marge). null si l'image est vide. */
export function trimCanvas(source: HTMLCanvasElement, padding = 8): TrimmedImage | null {
  const ctx = source.getContext("2d", { willReadFrequently: true })!;
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out
    .getContext("2d")!
    .drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return { canvas: out, width: out.width, height: out.height };
}

/**
 * Détourage : les pixels plus clairs que `threshold` deviennent transparents,
 * avec une transition douce (pas d'effet crénelé sur le trait).
 */
export function removeBackground(canvas: HTMLCanvasElement, threshold: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const d = image.data;
  const soft = 40;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    if (lum >= threshold) d[i + 3] = 0;
    else if (lum > threshold - soft) d[i + 3] = Math.round(d[i + 3]! * ((threshold - lum) / soft));
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"),
  );
}

/** Six polices manuscrites, chargées uniquement à l'ouverture de l'onglet « Taper ». */
export const HANDWRITING_FONTS = [
  { family: "Great Vibes", file: "great-vibes" },
  { family: "Dancing Script", file: "dancing-script" },
  { family: "Caveat", file: "caveat" },
  { family: "Homemade Apple", file: "homemade-apple" },
  { family: "Mrs Saint Delafield", file: "mrs-saint-delafield" },
  { family: "La Belle Aurore", file: "la-belle-aurore" },
] as const;

let fontsPromise: Promise<void> | null = null;

export function loadHandwritingFonts(): Promise<void> {
  fontsPromise ??= Promise.all(
    HANDWRITING_FONTS.map(async ({ family, file }) => {
      const face = new FontFace(
        `QS ${family}`,
        `url(/fonts/handwriting/${file}.woff2) format("woff2")`,
        { display: "swap" },
      );
      await face.load();
      document.fonts.add(face);
    }),
  ).then(() => undefined);
  return fontsPromise;
}

/** Rendu d'un nom en écriture manuscrite → canvas haute définition recadré. */
export function renderTypedSignature(
  text: string,
  family: string,
  color: string,
): TrimmedImage | null {
  const size = 180;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${size}px "QS ${family}"`;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width + size);
  canvas.height = Math.ceil(size * 2);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, size / 2, canvas.height / 2);
  return trimCanvas(canvas, 12);
}
