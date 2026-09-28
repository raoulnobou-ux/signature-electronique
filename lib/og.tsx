import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Police des images générées (OG, icônes) — satori n'accepte pas le WOFF2. */
export async function loadDisplayFont() {
  return readFile(join(process.cwd(), "assets/fonts/space-grotesk-600.woff"));
}

/** Emblème QuickSign en SVG inline pour ImageResponse. */
export function LogoGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="0.5" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#g)" />
      <path
        d="M7 20.5c2.2-.4 3.6-7.5 6.2-7.5 2.3 0-.6 7.6 1.9 7.6 2 0 2.6-4.3 4.6-4.3 1.6 0 1.2 3 3 3 1 0 1.8-.8 2.3-1.6"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 24.5h17"
        stroke="white"
        strokeOpacity="0.45"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
