import { ImageResponse } from "next/og";
import { loadDisplayFont, LogoGlyph } from "@/lib/og";

export const alt = "QuickSign — Signez, faites signer, terminé. En 30 secondes.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const font = await loadDisplayFont();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#07090F",
        backgroundImage:
          "radial-gradient(circle at 18% 12%, rgba(99,102,241,.55), transparent 45%), radial-gradient(circle at 88% 30%, rgba(139,92,246,.45), transparent 40%), radial-gradient(circle at 60% 110%, rgba(34,211,238,.35), transparent 45%)",
        color: "#E8EBF4",
        fontFamily: "Space Grotesk",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <LogoGlyph size={64} />
        <span style={{ fontSize: 40 }}>QuickSign</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2 }}>
          Signez, faites signer, terminé.
        </span>
        <span
          style={{
            fontSize: 76,
            lineHeight: 1.05,
            letterSpacing: -2,
            backgroundImage: "linear-gradient(90deg, #818CF8, #A78BFA, #22D3EE)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          En 30 secondes.
        </span>
      </div>
      <span style={{ fontSize: 28, color: "#939BB0" }}>
        Signature électronique · Cachet d&apos;entreprise · Mobile Money · WhatsApp
      </span>
    </div>,
    { ...size, fonts: [{ name: "Space Grotesk", data: font, weight: 600, style: "normal" }] },
  );
}
