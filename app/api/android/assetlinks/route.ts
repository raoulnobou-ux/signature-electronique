import { NextResponse } from "next/server";
import { androidAssetLinks } from "@/lib/android";

export const dynamic = "force-dynamic";

/** Servi sous /.well-known/assetlinks.json (réécriture dans next.config.ts). */
export function GET() {
  const links = androidAssetLinks({
    ANDROID_PACKAGE_NAME: process.env.ANDROID_PACKAGE_NAME,
    ANDROID_CERT_FINGERPRINTS: process.env.ANDROID_CERT_FINGERPRINTS,
  });
  return NextResponse.json(links, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
