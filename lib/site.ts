/** Informations publiques du site, partagées par les métadonnées, les e-mails et les pages. */
export const siteConfig = {
  name: "QuickSign",
  tagline: "Signez, faites signer, terminé. En 30 secondes.",
  description:
    "Signez vos documents Word et PDF en quelques secondes, avec votre signature et le cachet de votre structure. Pensé pour le Cameroun et l'Afrique francophone.",
  // Même règle que lib/env.ts (sans la validation, pour rester importable partout).
  url:
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
  supportEmail: "support@quicksign.app",
  trialDays: 6,
} as const;
