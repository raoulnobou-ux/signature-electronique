import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { AppProviders } from "@/components/providers/app-providers";
import { ClientMessages } from "@/components/providers/client-messages";
import { siteConfig } from "@/lib/site";
import "./globals.css";

const inter = localFont({
  src: "./fonts/inter.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});

const EN_DESCRIPTION =
  "Sign your Word and PDF documents in seconds, with your signature and your organization's stamp. Built for Cameroon and French-speaking Africa.";

export async function generateMetadata(): Promise<Metadata> {
  const en = (await getLocale()) === "en";
  const description = en ? EN_DESCRIPTION : siteConfig.description;
  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: en
        ? "QuickSign — Sign, get it signed, done."
        : "QuickSign — Signez, faites signer, terminé.",
      template: "%s · QuickSign",
    },
    description,
    applicationName: "QuickSign",
    openGraph: {
      type: "website",
      siteName: "QuickSign",
      locale: en ? "en_CM" : "fr_CM",
      alternateLocale: en ? "fr_CM" : "en_CM",
      title: en
        ? "QuickSign — Sign, get it signed, done. In 30 seconds."
        : "QuickSign — Signez, faites signer, terminé. En 30 secondes.",
      description,
    },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07090F" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7FB" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, nonce] = await Promise.all([
    getLocale(),
    headers().then((h) => h.get("x-nonce") ?? undefined),
  ]);
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${spaceGrotesk.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <ClientMessages>
          <AppProviders nonce={nonce}>{children}</AppProviders>
        </ClientMessages>
      </body>
    </html>
  );
}
