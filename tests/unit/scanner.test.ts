import { describe, expect, it } from "vitest";
import {
  detectDocumentQuad,
  homography,
  otsuThreshold,
  outputSize,
  type Quad,
} from "@/lib/images/geometry";

describe("scanner de documents", () => {
  it("sépare le papier clair du fond sombre (Otsu)", () => {
    const gray = new Uint8Array([...new Array(50).fill(30), ...new Array(50).fill(220)]);
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });

  it("détecte les coins d'une feuille inclinée sur une table", () => {
    const w = 200;
    const h = 200;
    const gray = new Uint8Array(w * h).fill(40);
    // Losange clair (feuille tournée) centré dans l'image
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (Math.abs(x - 100) + Math.abs(y - 100) <= 70) gray[y * w + x] = 235;
      }
    }
    const [top, right, bottom, left] = detectDocumentQuad(gray, w, h);
    // Les extrêmes x+y / x−y d'un losange sont ses côtés ; on vérifie la plage couverte.
    expect(top.x + top.y).toBeLessThanOrEqual(131);
    expect(bottom.x + bottom.y).toBeGreaterThanOrEqual(269);
    expect(right.x - right.y).toBeGreaterThanOrEqual(69);
    expect(left.x - left.y).toBeLessThanOrEqual(-69);
  });

  it("revient à un cadre par défaut si aucune feuille n'est trouvée", () => {
    const gray = new Uint8Array(100 * 100).fill(128);
    const quad = detectDocumentQuad(gray, 100, 100);
    expect(quad[0]).toEqual({ x: 6, y: 6 });
  });

  it("l'homographie envoie exactement les quatre coins sur le rectangle cible", () => {
    const src: Quad = [
      { x: 12, y: 30 },
      { x: 180, y: 10 },
      { x: 195, y: 260 },
      { x: 5, y: 240 },
    ];
    const dst: Quad = [
      { x: 0, y: 0 },
      { x: 210, y: 0 },
      { x: 210, y: 297 },
      { x: 0, y: 297 },
    ];
    const map = homography(src, dst);
    src.forEach((p, i) => {
      const q = map(p);
      expect(q.x).toBeCloseTo(dst[i]!.x, 6);
      expect(q.y).toBeCloseTo(dst[i]!.y, 6);
    });
  });

  it("calcule une taille de sortie proportionnée et bornée", () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 2828 },
      { x: 0, y: 2828 },
    ];
    expect(outputSize(quad, 1414)).toEqual({ width: 1000, height: 1414 });
  });
});
