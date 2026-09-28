import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

const routes = [
  "",
  "/tarifs",
  "/securite",
  "/contact",
  "/cgu",
  "/confidentialite",
  "/mentions-legales",
  "/inscription",
  "/connexion",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((path) => ({
    url: `${siteConfig.url}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/tarifs" ? 0.8 : 0.5,
  }));
}
