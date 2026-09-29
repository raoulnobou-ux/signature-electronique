import { readFileSync } from "node:fs";
import { degrees, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fieldSchema, formatSignatureDate, type Field } from "@/lib/pdf/fields";
import { displayToPdf, fieldMatrix, stampPdf, type PageGeometry } from "@/lib/pdf/stamp";

const A4 = { x: 0, y: 0, width: 595.28, height: 841.89 };

function field(partial: Partial<Field>): Field {
  return {
    id: "f",
    page: 0,
    x: 10,
    y: 10,
    w: 20,
    h: 5,
    rotation: 0,
    opacity: 1,
    type: "text",
    value: "Lu et approuvé",
    ...partial,
  };
}

/** Texte extrait avec pdf.js, avec position PDF (coin bas-gauche de la ligne). */
async function extractText(bytes: Uint8Array, pageIndex = 0) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    isEvalSupported: false,
  } as never).promise;
  const page = await doc.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  return content.items
    .filter(
      (i): i is typeof i & { str: string; transform: number[] } =>
        "str" in i && i.str.trim().length > 0,
    )
    .map((i) => ({ text: i.str, x: i.transform[4]!, y: i.transform[5]! }));
}

describe("coordonnées des champs", () => {
  const geo: PageGeometry = { box: { x: 0, y: 0, width: 600, height: 800 }, rotation: 0 };

  it("page droite : pourcentage → points, origine en bas à gauche", () => {
    const { matrix, width, height } = fieldMatrix(geo, { x: 10, y: 20, w: 30, h: 10, rotation: 0 });
    expect(width).toBeCloseTo(180);
    expect(height).toBeCloseTo(80);
    const [a, b, c, d, e, f] = matrix;
    expect([a, b, c, d]).toEqual([1, 0, 0, 1].map((n) => expect.closeTo(n, 9)));
    expect(e).toBeCloseTo(60);
    expect(f).toBeCloseTo(800 - (160 + 80));
  });

  it("tient compte d'une CropBox décalée", () => {
    const shifted: PageGeometry = { box: { x: 50, y: 30, width: 600, height: 800 }, rotation: 0 };
    expect(displayToPdf(shifted, 0, 0)).toEqual({ x: 50, y: 830 });
    expect(displayToPdf(shifted, 1, 1)).toEqual({ x: 650, y: 30 });
  });

  it.each([90, 180, 270])(
    "page tournée à %i° : les quatre coins affichés tombent sur les coins de la page",
    (rotation) => {
      const g: PageGeometry = { box: { x: 0, y: 0, width: 600, height: 800 }, rotation };
      const corners = [
        displayToPdf(g, 0, 0),
        displayToPdf(g, 1, 0),
        displayToPdf(g, 1, 1),
        displayToPdf(g, 0, 1),
      ]
        .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
        .sort();
      expect(corners).toEqual(["0,0", "0,800", "600,0", "600,800"]);
    },
  );

  it("une rotation du champ conserve son centre", () => {
    const straight = fieldMatrix(geo, { x: 40, y: 40, w: 20, h: 10, rotation: 0 });
    const turned = fieldMatrix(geo, { x: 40, y: 40, w: 20, h: 10, rotation: 12 });
    const center = ({ matrix: [a, b, c, d, e, f], width, height }: typeof straight) => ({
      x: a * (width / 2) + c * (height / 2) + e,
      y: b * (width / 2) + d * (height / 2) + f,
    });
    expect(center(turned).x).toBeCloseTo(center(straight).x, 6);
    expect(center(turned).y).toBeCloseTo(center(straight).y, 6);
  });
});

describe("génération du PDF signé", () => {
  async function blankPdf(rotation = 0, pages = 1) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++)
      doc.addPage([A4.width, A4.height]).setRotation(degrees(rotation));
    return doc.save();
  }

  it("incruste le texte à l'endroit choisi (page droite)", async () => {
    const out = await stampPdf(
      await blankPdf(),
      [field({ x: 60, y: 80, w: 30, h: 3, value: "Lu et approuvé" })],
      { images: new Map() },
    );
    const [item] = await extractText(out);
    expect(item?.text).toBe("Lu et approuvé");
    expect(item!.x).toBeCloseTo(0.6 * A4.width, 0);
    // Bas du champ à 83 % depuis le haut → y PDF ≈ 17 % de la hauteur (+ centrage vertical)
    expect(item!.y).toBeGreaterThan(0.17 * A4.height - 1);
    expect(item!.y).toBeLessThan(0.2 * A4.height);
  });

  it("place correctement le texte sur une page affichée en paysage (rotation 90°)", async () => {
    const out = await stampPdf(
      await blankPdf(90),
      [field({ x: 5, y: 5, w: 40, h: 4, value: "Bon pour accord" })],
      { images: new Map() },
    );
    const [item] = await extractText(out);
    expect(item?.text).toBe("Bon pour accord");
    // Coin haut-gauche affiché d'une page tournée de 90° = coin bas-gauche de la page non tournée.
    const expected = displayToPdf({ box: A4, rotation: 90 }, 0.05, 0.09);
    expect(item!.x).toBeLessThan(A4.width * 0.2);
    expect(Math.abs(item!.y - expected.y)).toBeLessThan(A4.height * 0.1);
  });

  it("appose une signature PNG sur plusieurs pages et conserve le nombre de pages", async () => {
    const png = new Uint8Array(readFileSync("tests/e2e/fixtures/avatar.png"));
    const assetId = "3f0c9d1e-6c2a-4f5e-9a8b-1c2d3e4f5a6b";
    const fields = [0, 1, 2].map((page) =>
      field({
        id: `s${page}`,
        page,
        type: "signature",
        assetId,
        value: null,
        x: 70,
        y: 85,
        w: 20,
        h: 8,
      }),
    );
    const out = await stampPdf(await blankPdf(0, 3), fields, {
      images: new Map([[assetId, png]]),
      footer: "Signé avec QuickSign le 28 septembre 2026",
    });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getProducer()).toBe("QuickSign");
    for (let i = 0; i < 3; i++) {
      const texts = await extractText(out, i);
      expect(texts.some((t) => t.text.includes("Signé avec QuickSign"))).toBe(true);
    }
    // L'image n'est intégrée qu'une fois, même utilisée sur trois pages.
    const images = [...new TextDecoder("latin1").decode(out).matchAll(/\/Subtype\s*\/Image/g)];
    expect(images.length).toBe(1);
  });

  it("ne modifie jamais l'original et refuse une page inexistante", async () => {
    const source = await blankPdf();
    const copy = source.slice();
    await stampPdf(source, [field({})], { images: new Map() });
    expect(source).toEqual(copy);
    await expect(stampPdf(source, [field({ page: 3 })], { images: new Map() })).rejects.toThrow();
  });

  it("remplace les caractères non pris en charge sans échouer", async () => {
    const out = await stampPdf(await blankPdf(), [field({ value: "Awa 😀 Nkeng — œuvre" })], {
      images: new Map(),
    });
    const [item] = await extractText(out);
    expect(item?.text).toContain("Awa");
    expect(item?.text).toContain("œuvre");
  });
});

describe("validation des champs", () => {
  it("refuse un champ hors de la page ou une signature sans image", () => {
    expect(fieldSchema.safeParse(field({ x: 90, w: 20 })).success).toBe(false);
    expect(fieldSchema.safeParse(field({ type: "signature", assetId: null })).success).toBe(false);
    expect(fieldSchema.safeParse(field({})).success).toBe(true);
  });

  it("formate la date à la française avec la ville", () => {
    expect(formatSignatureDate(new Date("2026-09-28T10:00:00Z"), "Africa/Douala", "Douala")).toBe(
      "28 septembre 2026, Douala",
    );
  });
});
