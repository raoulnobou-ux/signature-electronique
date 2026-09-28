/**
 * Géométrie du scanner de documents : détection des coins de la feuille et
 * transformation perspective (homographie). Fonctions pures, testées unitairement.
 */

export type Point = { x: number; y: number };
/** Coins dans l'ordre : haut-gauche, haut-droit, bas-droit, bas-gauche. */
export type Quad = [Point, Point, Point, Point];

/** Seuil d'Otsu : sépare au mieux les pixels clairs (papier) des pixels sombres (fond). */
export function otsuThreshold(gray: Uint8ClampedArray | Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]!++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Détecte la feuille (plus grande zone claire connexe) et renvoie ses quatre coins,
 * en coordonnées de l'image analysée. Repli : cadre à 6 % des bords.
 */
export function detectDocumentQuad(
  gray: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Quad {
  const fallback: Quad = [
    { x: width * 0.06, y: height * 0.06 },
    { x: width * 0.94, y: height * 0.06 },
    { x: width * 0.94, y: height * 0.94 },
    { x: width * 0.06, y: height * 0.94 },
  ];
  const threshold = otsuThreshold(gray);
  const labels = new Int32Array(width * height).fill(-1);
  let bestLabel = -1;
  let bestSize = 0;
  let label = 0;
  const stack: number[] = [];

  for (let start = 0; start < gray.length; start++) {
    if (labels[start] !== -1 || gray[start]! <= threshold) continue;
    let size = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % width;
      const y = (i - x) / width;
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && labels[n] === -1 && gray[n]! > threshold) {
          labels[n] = label;
          stack.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
    label++;
  }

  // Une feuille doit couvrir au moins 15 % de la photo, sans la remplir entièrement.
  if (bestLabel < 0 || bestSize < width * height * 0.15 || bestSize > width * height * 0.98)
    return fallback;

  let tl = { x: 0, y: 0, s: Infinity };
  let br = { x: 0, y: 0, s: -Infinity };
  let tr = { x: 0, y: 0, d: -Infinity };
  let bl = { x: 0, y: 0, d: Infinity };
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== bestLabel) continue;
    const x = i % width;
    const y = (i - x) / width;
    const s = x + y;
    const d = x - y;
    if (s < tl.s) tl = { x, y, s };
    if (s > br.s) br = { x, y, s };
    if (d > tr.d) tr = { x, y, d };
    if (d < bl.d) bl = { x, y, d };
  }
  return [
    { x: tl.x, y: tl.y },
    { x: tr.x, y: tr.y },
    { x: br.x, y: br.y },
    { x: bl.x, y: bl.y },
  ];
}

/** Résout Ax = b (élimination de Gauss avec pivot partiel). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-12) throw new Error("singular");
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / p;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * Homographie H (3×3, h33 = 1) telle que H·src[i] = dst[i] pour les 4 points.
 * Renvoie une fonction qui transforme un point.
 */
export function homography(src: Quad, dst: Quad): (p: Point) => Point {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const [h11, h12, h13, h21, h22, h23, h31, h32] = solve(a, b) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return ({ x, y }) => {
    const w = h31 * x + h32 * y + 1;
    return { x: (h11 * x + h12 * y + h13) / w, y: (h21 * x + h22 * y + h23) / w };
  };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Taille de sortie redressée : moyenne des côtés opposés, bornée à `maxEdge`. */
export function outputSize(quad: Quad, maxEdge: number): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const w = Math.max(dist(tl, tr), dist(bl, br));
  const h = Math.max(dist(tl, bl), dist(tr, br));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
