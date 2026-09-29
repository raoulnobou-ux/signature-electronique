import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * En-têtes de sécurité appliqués à toutes les réponses.
 * La politique CSP complète (avec nonces) est traitée à l'audit de sécurité (Phase 9) ;
 * on pose dès maintenant les directives qui ne dépendent pas des scripts.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // pdf.js lit le texte des PDF côté serveur (assistant) : chargé tel quel, non empaqueté.
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    // Photos de profil (2 Mo max) envoyées par Server Action ; les documents, eux,
    // partent directement vers le stockage via une URL signée.
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Service worker : jamais mis en cache par le navigateur, limité à notre origine.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
