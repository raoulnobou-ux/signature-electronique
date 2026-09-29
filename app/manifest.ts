import type { MetadataRoute } from "next";

/** Manifeste de l'application installable (écran d'accueil du téléphone, bureau). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "QuickSign — Signature électronique",
    short_name: "QuickSign",
    description: "Signez, faites signer, terminé. En 30 secondes. — Sign, get it signed, done.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07090F",
    theme_color: "#07090F",
    lang: "fr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Signer un document", short_name: "Signer", url: "/app/documents?importer=1" },
      { name: "Documents", url: "/app/documents" },
      { name: "Assistant", url: "/app/assistant" },
    ],
  };
}
