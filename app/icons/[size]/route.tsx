import { ImageResponse } from "next/og";
import { LogoGlyph } from "@/lib/og";

/** Icônes de l'application installable (manifeste) : 192 et 512 px, variante « maskable ». */
const SIZES = { "192": 192, "512": 512, "maskable-512": 512 } as const;

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_request: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size: key } = await ctx.params;
  const size = SIZES[key as keyof typeof SIZES];
  if (!size) return new Response("Not found", { status: 404 });
  const maskable = key.startsWith("maskable");
  // Zone de sécurité des icônes maskable : l'emblème occupe ~70 % au centre.
  const inner = maskable ? Math.round(size * 0.7) : size;
  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: maskable ? "#07090F" : "transparent",
      }}
    >
      <LogoGlyph size={inner} />
    </div>,
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=604800, immutable" },
    },
  );
}
