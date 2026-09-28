"use client";

import { MAX_IMAGE_EDGE } from "@/lib/documents/limits";
import { detectDocumentQuad, homography, outputSize, type Quad } from "./geometry";

/** Décode une image en respectant l'orientation EXIF (photos de téléphone). */
export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encodage"))),
      "image/jpeg",
      quality,
    ),
  );
}

/** Photo → JPEG allégé (≤ 2480 px), pour un envoi rapide même en 3G. */
export async function compressImage(file: Blob, maxEdge = MAX_IMAGE_EDGE): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = canvasOf(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToJpeg(canvas);
}

/** Détecte la feuille sur une version réduite de la photo, puis remet à l'échelle. */
export function detectQuad(bitmap: ImageBitmap): Quad {
  const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = canvasOf(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // Léger flou : ignore le texte imprimé pour ne garder que la forme de la feuille.
  ctx.filter = "blur(2px)";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  }
  return detectDocumentQuad(gray, w, h).map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
}

export type ScanMode = "color" | "document";

/**
 * Redresse la feuille (correction de perspective) puis améliore le rendu :
 * « document » = niveaux de gris très contrastés, comme un scanner.
 */
export function straighten(
  bitmap: ImageBitmap,
  quad: Quad,
  mode: ScanMode,
  maxEdge = MAX_IMAGE_EDGE,
): HTMLCanvasElement {
  const { width, height } = outputSize(quad, maxEdge);
  const src = canvasOf(bitmap.width, bitmap.height);
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(bitmap, 0, 0);
  const input = sctx.getImageData(0, 0, bitmap.width, bitmap.height);

  const out = canvasOf(width, height);
  const octx = out.getContext("2d")!;
  const output = octx.createImageData(width, height);
  // Correspondance inverse : pour chaque pixel de sortie, on lit la photo source.
  const map = homography(
    [
      { x: 0, y: 0 },
      { x: width - 1, y: 0 },
      { x: width - 1, y: height - 1 },
      { x: 0, y: height - 1 },
    ],
    quad,
  );
  const sw = bitmap.width;
  const sh = bitmap.height;
  const s = input.data;
  const o = output.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = map({ x, y });
      const x0 = Math.min(sw - 2, Math.max(0, Math.floor(p.x)));
      const y0 = Math.min(sh - 2, Math.max(0, Math.floor(p.y)));
      const fx = Math.min(1, Math.max(0, p.x - x0));
      const fy = Math.min(1, Math.max(0, p.y - y0));
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      const oi = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        o[oi + c] =
          s[i00 + c]! * (1 - fx) * (1 - fy) +
          s[i10 + c]! * fx * (1 - fy) +
          s[i01 + c]! * (1 - fx) * fy +
          s[i11 + c]! * fx * fy;
      }
      o[oi + 3] = 255;
    }
  }
  if (mode === "document") enhanceDocument(o);
  octx.putImageData(output, 0, 0);
  return out;
}

/** Niveaux automatiques en niveaux de gris : fond blanc, texte bien noir. */
function enhanceDocument(data: Uint8ClampedArray) {
  const hist = new Array<number>(256).fill(0);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    data[i] = g;
    hist[g]!++;
  }
  let acc = 0;
  let low = 0;
  let high = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc < n * 0.02) low = v;
    if (acc < n * 0.75) high = v;
  }
  high = Math.max(high, low + 30);
  const range = high - low;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((data[i]! - low) * 255) / range));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}
