import { ImageResponse } from "next/og";
import { LogoGlyph } from "@/lib/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<LogoGlyph size={64} />, size);
}
