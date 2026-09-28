import { siteConfig } from "@/lib/site";
import { firstName } from "@/lib/utils";
import { renderEmail } from "./layout";

/** E-mails transactionnels de QuickSign (contenu en français ; anglais en Phase 9). */

export function welcomeEmail({ fullName }: { fullName: string }) {
  const name = firstName(fullName);
  return {
    subject: "Bienvenue sur QuickSign — votre essai de 6 jours commence",
    ...renderEmail({
      preheader: "Votre essai gratuit est actif : toutes les fonctionnalités Pro pendant 6 jours.",
      title: name ? `Bienvenue, ${name} !` : "Bienvenue sur QuickSign !",
      paragraphs: [
        `Votre compte est activé. Pendant ${siteConfig.trialDays} jours, vous profitez gratuitement de toutes les fonctionnalités du plan Pro : signatures, cachets, envoi à plusieurs signataires, assistant IA.`,
        "Pour bien démarrer : créez votre signature, ajoutez le cachet de votre structure, puis importez votre premier document. Comptez moins d'une minute.",
        "Une question ? Répondez simplement à cet e-mail, nous vous aidons avec plaisir.",
      ],
      cta: { label: "Signer mon premier document", url: `${siteConfig.url}/app/bienvenue` },
      footnote: "Vous recevez cet e-mail car vous venez de créer un compte QuickSign.",
    }),
  };
}
