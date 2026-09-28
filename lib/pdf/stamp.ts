import {
  concatTransformationMatrix,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { isImageField, type Field } from "./fields";

/** Matrice affine PDF [a b c d e f] : (u, v) ↦ (a·u + c·v + e, b·u + d·v + f). */
export type Matrix = [number, number, number, number, number, number];

export type PageGeometry = {
  /** Zone visible de la page (CropBox) en points PDF. */
  box: { x: number; y: number; width: number; height: number };
  /** Rotation d'affichage de la page (0, 90, 180, 270). */
  rotation: number;
};

/** Taille de la page telle qu'affichée (largeur/hauteur échangées à 90° et 270°). */
export function displaySize(geo: PageGeometry): { width: number; height: number } {
  const r = ((geo.rotation % 360) + 360) % 360;
  return r === 90 || r === 270
    ? { width: geo.box.height, height: geo.box.width }
    : { width: geo.box.width, height: geo.box.height };
}

/**
 * Point affiché (fractions 0–1 depuis le coin haut-gauche de la page affichée)
 * → coordonnées PDF (origine en bas à gauche de la page non tournée).
 */
export function displayToPdf(geo: PageGeometry, fx: number, fy: number): { x: number; y: number } {
  const r = ((geo.rotation % 360) + 360) % 360;
  let a: number; // fraction horizontale dans la page non tournée (depuis la gauche)
  let b: number; // fraction verticale dans la page non tournée (depuis le haut)
  if (r === 90) [a, b] = [fy, 1 - fx];
  else if (r === 180) [a, b] = [1 - fx, 1 - fy];
  else if (r === 270) [a, b] = [1 - fy, fx];
  else [a, b] = [fx, fy];
  return { x: geo.box.x + a * geo.box.width, y: geo.box.y + (1 - b) * geo.box.height };
}

/**
 * Matrice qui envoie le repère local du champ — origine en bas à gauche, unités en points,
 * largeur `width`, hauteur `height` — sur la page PDF, en tenant compte de la rotation
 * du champ (sens horaire à l'écran, autour de son centre) et de celle de la page.
 */
export function fieldMatrix(geo: PageGeometry, field: Pick<Field, "x" | "y" | "w" | "h" | "rotation">) {
  const size = displaySize(geo);
  const width = (field.w / 100) * size.width;
  const height = (field.h / 100) * size.height;
  const cx = (field.x / 100) * size.width + width / 2;
  const cy = (field.y / 100) * size.height + height / 2;
  const theta = ((field.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Local (u vers la droite, v vers le haut) → affichage (points, y vers le bas).
  const toDisplay = (u: number, v: number) => {
    const dx = u - width / 2;
    const dy = height / 2 - v;
    return { X: cx + dx * cos - dy * sin, Y: cy + dx * sin + dy * cos };
  };
  const toPdf = (u: number, v: number) => {
    const { X, Y } = toDisplay(u, v);
    return displayToPdf(geo, X / size.width, Y / size.height);
  };

  const o = toPdf(0, 0);
  const ux = toPdf(1, 0);
  const vy = toPdf(0, 1);
  const matrix: Matrix = [ux.x - o.x, ux.y - o.y, vy.x - o.x, vy.y - o.y, o.x, o.y];
  return { matrix, width, height };
}

export type StampOptions = {
  /** Images (PNG) des signatures / paraphes / cachets, par identifiant d'actif. */
  images: Map<string, Uint8Array>;
  /** Mention d'horodatage incrustée en bas de chaque page signée (facultatif). */
  footer?: string | null;
  metadata?: { author?: string; title?: string; signedAt?: Date };
};

const INK = rgb(0.07, 0.09, 0.15);

/** Remplace les caractères absents de la police standard (non WinAnsi) pour ne jamais échouer. */
export function encodableText(font: PDFFont, text: string): string {
  let out = "";
  for (const char of text.normalize("NFC")) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      out += char === " " || char === " " ? " " : "?";
    }
  }
  return out;
}

/** Taille de police qui fait tenir le texte dans la boîte (hauteur et largeur). */
function fitFontSize(font: PDFFont, text: string, width: number, height: number): number {
  let size = height * 0.72;
  const measured = font.widthOfTextAtSize(text, size);
  if (measured > width * 0.98) size *= (width * 0.98) / measured;
  return Math.max(4, size);
}

function drawField(page: PDFPage, geo: PageGeometry, field: Field, font: PDFFont, image?: PDFImage) {
  const { matrix, width, height } = fieldMatrix(geo, field);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrix));

  if (isImageField(field.type) && image) {
    page.drawImage(image, { x: 0, y: 0, width, height, opacity: field.opacity });
  } else if (field.type === "checkbox") {
    const s = Math.min(width, height);
    page.drawRectangle({ x: 0, y: 0, width: s, height: s, borderColor: INK, borderWidth: s * 0.08 });
    if (field.value === "true") {
      page.drawLine({ start: { x: s * 0.2, y: s * 0.52 }, end: { x: s * 0.42, y: s * 0.28 }, thickness: s * 0.12, color: INK, opacity: field.opacity });
      page.drawLine({ start: { x: s * 0.42, y: s * 0.28 }, end: { x: s * 0.82, y: s * 0.76 }, thickness: s * 0.12, color: INK, opacity: field.opacity });
    }
  } else {
    const text = encodableText(font, (field.value ?? "").trim());
    if (text) {
      const size = fitFontSize(font, text, width, height);
      page.drawText(text, { x: 0, y: (height - size * 0.72) / 2, size, font, color: INK, opacity: field.opacity });
    }
  }
  page.pushOperators(popGraphicsState());
}

/**
 * Incruste les champs dans le PDF, sans toucher au contenu existant (ajout de calques).
 * Renvoie le nouveau PDF et le nombre de champs appliqués.
 */
export async function stampPdf(source: Uint8Array, fields: Field[], options: StampOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source, { updateMetadata: false });
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const embedded = new Map<string, PDFImage>();

  for (const field of fields) {
    const page = pages[field.page];
    if (!page) throw new Error(`page ${field.page} inexistante`);
    const geo: PageGeometry = { box: page.getCropBox(), rotation: page.getRotation().angle };

    let image: PDFImage | undefined;
    if (isImageField(field.type)) {
      const id = field.assetId!;
      image = embedded.get(id);
      if (!image) {
        const bytes = options.images.get(id);
        if (!bytes) throw new Error(`image ${id} manquante`);
        image = await pdf.embedPng(bytes);
        embedded.set(id, image);
      }
    }
    drawField(page, geo, field, font, image);
  }

  if (options.footer) {
    const signedPages = new Set(fields.map((f) => f.page));
    for (const index of signedPages) {
      const page = pages[index]!;
      const geo: PageGeometry = { box: page.getCropBox(), rotation: page.getRotation().angle };
      const size = displaySize(geo);
      // Mention discrète, centrée à 12 pt du bas de la page affichée.
      const footerField: Field = {
        id: "footer",
        page: index,
        x: 5,
        y: 100 - (18 / size.height) * 100,
        w: 90,
        h: (9 / size.height) * 100,
        rotation: 0,
        opacity: 0.75,
        type: "text",
        value: options.footer,
      };
      const { matrix, width } = fieldMatrix(geo, footerField);
      const text = encodableText(font, options.footer);
      const fontSize = Math.min(6.5, fitFontSize(font, text, width, 9));
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrix));
      page.drawText(text, { x: (width - textWidth) / 2, y: 1, size: fontSize, font, color: rgb(0.35, 0.38, 0.45) });
      page.pushOperators(popGraphicsState());
    }
  }

  const meta = options.metadata;
  if (meta?.author) pdf.setAuthor(meta.author);
  if (meta?.title) pdf.setTitle(meta.title);
  pdf.setProducer("QuickSign");
  pdf.setCreator("QuickSign — signature électronique");
  pdf.setSubject("Document signé avec QuickSign");
  pdf.setKeywords(["QuickSign", "signature électronique"]);
  pdf.setModificationDate(meta?.signedAt ?? new Date());

  return pdf.save({ useObjectStreams: true });
}

