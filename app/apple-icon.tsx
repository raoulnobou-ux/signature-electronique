import { ImageResponse } from "next/og";
import { LogoGlyph } from "@/lib/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#07090F",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LogoGlyph size={132} />
    </div>,
    size,
  );
}
