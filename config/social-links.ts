import type { SocialIcon } from "@/components/brand/social-icons";

/**
 * Réseaux sociaux et contacts de QuickSign, affichés dans le pied de page du site.
 * Pour modifier un lien, changer uniquement ce fichier. Un lien vide (ou un numéro
 * WhatsApp absent) masque simplement l'icône correspondante.
 */
export const SOCIAL_LINKS: { id: SocialIcon; label: string; href: string }[] = [
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/quicksign-app-5b0546440",
  },
  { id: "x", label: "X (Twitter)", href: "https://x.com/Quicksignapp" },
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/quicksignapp/" },
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/share/1BkLomFNMt/?mibextid=wwXIfr",
  },
  { id: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@quicksignapp" },
];

/** Adresse du support (pied de page, page Contact, e-mails). */
export const SUPPORT_EMAIL = "supportquicksignapp@gmail.com";

/**
 * Numéro WhatsApp au format international, chiffres uniquement, sans « + » ni espaces
 * (ex. "237690000000"). Vide : le bouton WhatsApp n'est pas affiché.
 */
export const WHATSAPP_NUMBER = "";

/** Lien wa.me, avec un message d'accueil prérempli. */
export function whatsappLink(message?: string): string | null {
  const number = WHATSAPP_NUMBER.replace(/\D/g, "");
  if (!number) return null;
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
