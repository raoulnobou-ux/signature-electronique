/**
 * Générateur de cachets d'entreprise en SVG : rond, ovale ou rectangulaire, texte
 * circulaire, couleurs d'encre usuelles et effet d'encre irrégulier (filtre SVG).
 * Fonction pure : le même SVG sert à l'aperçu, à l'export PNG et à l'archive vectorielle.
 */

export const STAMP_SHAPES = ["round", "oval", "rect"] as const;
export type StampShape = (typeof STAMP_SHAPES)[number];

export const STAMP_COLORS = {
  blue: "#1D3FAF",
  red: "#B3261E",
  green: "#17663A",
  black: "#1F2937",
} as const;
export type StampColor = keyof typeof STAMP_COLORS;

export interface StampOptions {
  shape: StampShape;
  color: StampColor;
  /** Nom de la structure (texte circulaire du haut, ou première ligne). */
  organization: string;
  /** Titre ou fonction (« Le Directeur Général »), au centre. */
  title?: string;
  /** Ville / pays (texte circulaire du bas, ou dernière ligne). */
  city?: string;
  /** Date affichée au centre (déjà formatée), ou vide. */
  date?: string;
  /** Effet d'encre irrégulier (tampon réel). */
  ink?: boolean;
  /** Graine de l'effet d'encre : chaque cachet a son grain, stable d'un rendu à l'autre. */
  seed?: number;
}

export const STAMP_PRESETS: {
  id: string;
  options: Omit<StampOptions, "organization" | "title" | "city" | "date">;
}[] = [
  { id: "classic", options: { shape: "round", color: "blue", ink: true } },
  { id: "official", options: { shape: "rect", color: "blue", ink: true } },
  { id: "oval", options: { shape: "oval", color: "red", ink: true } },
  { id: "clean", options: { shape: "round", color: "black", ink: false } },
];

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const clean = (value: string | undefined, max: number) =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Taille de police qui fait tenir `text` sur `length` unités (estimation par la largeur moyenne des majuscules). */
export function fitFontSize(text: string, length: number, max: number, min = 7): number {
  if (!text) return max;
  const estimate = length / (text.length * 0.66);
  return Math.max(min, Math.min(max, Math.round(estimate * 10) / 10));
}

function inkFilter(seed: number): string {
  // 1) léger gondolement du trait ; 2) grain qui « mange » l'encre par endroits.
  return `<filter id="ink" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${seed}" result="warp"/>
  <feDisplacementMap in="SourceGraphic" in2="warp" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="shaken"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed + 11}" result="grain"/>
  <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.35" result="mask"/>
  <feComposite in="shaken" in2="mask" operator="in"/>
</filter>`;
}

function centerLines(
  lines: { text: string; size: number; weight: number }[],
  cx: number,
  cy: number,
  color: string,
): string {
  const gap = 4;
  const total = lines.reduce((sum, l) => sum + l.size, 0) + gap * (lines.length - 1);
  let y = cy - total / 2;
  return lines
    .map((line) => {
      y += line.size;
      const out = `<text x="${cx}" y="${(y - line.size * 0.12).toFixed(1)}" text-anchor="middle" font-size="${line.size}" font-weight="${line.weight}" fill="${color}">${escapeXml(line.text)}</text>`;
      y += gap;
      return out;
    })
    .join("");
}

/** Construit le SVG du cachet (viewBox en unités arbitraires, fond transparent). */
export function renderStampSvg(input: StampOptions): string {
  const color = STAMP_COLORS[input.color] ?? STAMP_COLORS.blue;
  const organization = clean(input.organization, 60).toUpperCase() || "VOTRE STRUCTURE";
  const title = clean(input.title, 40);
  const city = clean(input.city, 40).toUpperCase();
  const date = clean(input.date, 32);
  const seed = Math.abs(Math.round(input.seed ?? 7)) % 1000;
  const filter = input.ink ? inkFilter(seed) : "";
  const group = input.ink ? ' filter="url(#ink)"' : "";
  const font = 'font-family="Arial, Helvetica, sans-serif" letter-spacing="0.5"';

  if (input.shape === "rect") {
    const w = 360;
    const h = 200;
    const lines = [
      { text: organization, size: fitFontSize(organization, 300, 22), weight: 700 },
      ...(title ? [{ text: title, size: fitFontSize(title, 280, 17), weight: 600 }] : []),
      ...(date ? [{ text: date, size: 14, weight: 500 }] : []),
      ...(city ? [{ text: city, size: fitFontSize(city, 280, 13), weight: 600 }] : []),
    ];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs>${filter}</defs>
<g${group} ${font}>
<rect x="8" y="8" width="${w - 16}" height="${h - 16}" rx="10" fill="none" stroke="${color}" stroke-width="5"/>
<rect x="18" y="18" width="${w - 36}" height="${h - 36}" rx="6" fill="none" stroke="${color}" stroke-width="1.8"/>
${centerLines(lines, w / 2, h / 2, color)}
</g>
</svg>`;
  }

  // Rond ou ovale : anneau de texte circulaire + centre.
  const oval = input.shape === "oval";
  const cx = oval ? 190 : 150;
  const cy = 150;
  const rx = oval ? 180 : 140;
  const ry = 140;
  const band = 42; // épaisseur de l'anneau de texte
  const topR = { x: rx - band * 0.72, y: ry - band * 0.72 };
  const bottomR = { x: rx - band * 0.28, y: ry - band * 0.28 };
  const arc = Math.PI * ((topR.x + topR.y) / 2) * 0.92;
  const topSize = fitFontSize(organization, arc, 21, 9);
  const bottomSize = fitFontSize(city, arc * 0.7, 17, 9);
  const center = [
    ...(title
      ? [{ text: title, size: fitFontSize(title, (rx - band) * 1.7, 17), weight: 700 }]
      : []),
    ...(date ? [{ text: date, size: 13, weight: 500 }] : []),
  ];
  const separators = city
    ? `<text x="${cx - rx + band / 2}" y="${cy + 6}" text-anchor="middle" font-size="16" fill="${color}">★</text>
<text x="${cx + rx - band / 2}" y="${cy + 6}" text-anchor="middle" font-size="16" fill="${color}">★</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cx * 2} ${cy * 2}" width="${cx * 2}" height="${cy * 2}">
<defs>${filter}
<path id="stamp-top" d="M ${cx - topR.x},${cy} A ${topR.x},${topR.y} 0 0 1 ${cx + topR.x},${cy}"/>
<path id="stamp-bottom" d="M ${cx - bottomR.x},${cy} A ${bottomR.x},${bottomR.y} 0 0 0 ${cx + bottomR.x},${cy}"/>
</defs>
<g${group} ${font}>
<ellipse cx="${cx}" cy="${cy}" rx="${rx - 3}" ry="${ry - 3}" fill="none" stroke="${color}" stroke-width="5"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx - 11}" ry="${ry - 11}" fill="none" stroke="${color}" stroke-width="1.5"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx - band}" ry="${ry - band}" fill="none" stroke="${color}" stroke-width="2.5"/>
<text font-size="${topSize}" font-weight="700" fill="${color}"><textPath href="#stamp-top" startOffset="50%" text-anchor="middle">${escapeXml(organization)}</textPath></text>
${city ? `<text font-size="${bottomSize}" font-weight="600" fill="${color}"><textPath href="#stamp-bottom" startOffset="50%" text-anchor="middle">${escapeXml(city)}</textPath></text>` : ""}
${separators}
${
  center.length
    ? `<line x1="${cx - (rx - band) * 0.62}" y1="${cy - 30}" x2="${cx + (rx - band) * 0.62}" y2="${cy - 30}" stroke="${color}" stroke-width="1.5"/>
<line x1="${cx - (rx - band) * 0.62}" y1="${cy + 32}" x2="${cx + (rx - band) * 0.62}" y2="${cy + 32}" stroke="${color}" stroke-width="1.5"/>
${centerLines(center, cx, cy, color)}`
    : ""
}
</g>
</svg>`;
}
