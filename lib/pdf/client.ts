"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

// Build « legacy » de pdf.js : polyfills inclus, fonctionne sur les navigateurs mobiles
// plus anciens très répandus (la build standard exige des navigateurs très récents).

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Charge pdf.js à la demande (jamais sur les pages qui n'affichent pas de PDF). */
export function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`;
    return pdfjs;
  });
  return pdfjsPromise;
}

/** Ouvre un PDF depuis des octets (fichier local) ou une URL signée. */
export async function openPdf(
  source: ArrayBuffer | Uint8Array | string,
): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const base = `/pdfjs/${pdfjs.version}/`;
  const task = pdfjs.getDocument({
    ...(typeof source === "string"
      ? { url: source }
      : { data: source instanceof Uint8Array ? source : new Uint8Array(source) }),
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
  });
  return task.promise;
}

/** Rend une page dans un canvas à la largeur CSS donnée (net sur écrans haute densité). */
export async function renderPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  maxScale = 3,
): Promise<void> {
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.min(maxScale, (cssWidth * dpr) / base.width);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) return;
  await page.render({ canvas, canvasContext: context, viewport }).promise;
}

/** Vignette JPEG de la première page (≈ 360 px de large, < 200 Ko). */
export async function renderThumbnail(
  source: ArrayBuffer | Uint8Array | string,
  width = 360,
): Promise<string> {
  const pdf = await openPdf(source);
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    await pdf.loadingTask.destroy();
  }
}
