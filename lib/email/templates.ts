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

// ---------------------------------------------------------------------------
// Abonnement et paiements (Phase 6)
// ---------------------------------------------------------------------------

const billingUrl = () => `${siteConfig.url}/app/abonnement`;
const renewUrl = () => `${siteConfig.url}/app/abonnement#plans`;
const greeting = (fullName: string) => (firstName(fullName) ? `Bonjour ${firstName(fullName)},` : "Bonjour,");

/** J-2 avant la fin de l'essai. */
export function trialEndingEmail({ fullName, endDate }: { fullName: string; endDate: string }) {
  return {
    subject: "Votre essai QuickSign se termine dans 2 jours",
    ...renderEmail({
      preheader: `Fin de l'essai le ${endDate}. Vos documents restent en sécurité.`,
      title: "Plus que 2 jours d'essai",
      paragraphs: [
        greeting(fullName),
        `Votre essai gratuit du plan Pro se termine le ${endDate}. Pour continuer à signer sans interruption, choisissez un plan : Essentiel à 5 000 FCFA ou Pro à 15 000 FCFA par mois, payables par Mobile Money (MTN, Orange) ou carte.`,
        "Les jours d'essai restants sont conservés : votre abonnement commencera à la fin de l'essai.",
      ],
      cta: { label: "Choisir mon plan", url: renewUrl() },
    }),
  };
}

/** L'essai est terminé : compte en lecture seule. */
export function trialEndedEmail({ fullName }: { fullName: string }) {
  return {
    subject: "Votre essai QuickSign est terminé",
    ...renderEmail({
      preheader: "Vos documents sont conservés. Choisissez un plan pour signer à nouveau.",
      title: "Votre essai est terminé",
      paragraphs: [
        greeting(fullName),
        "Votre essai gratuit est arrivé à son terme. Votre compte passe en lecture seule : vous pouvez toujours consulter et télécharger vos documents signés. Rien n'est supprimé.",
        "Pour signer de nouveaux documents, choisissez un plan en quelques secondes.",
      ],
      cta: { label: "Réactiver mon compte", url: renewUrl() },
    }),
  };
}

export function paymentSucceededEmail({
  fullName,
  planLabel,
  amount,
  periodEnd,
  receiptNumber,
}: {
  fullName: string;
  planLabel: string;
  amount: string;
  periodEnd: string;
  receiptNumber: string;
}) {
  return {
    subject: `Paiement reçu — reçu ${receiptNumber}`,
    ...renderEmail({
      preheader: `Votre plan ${planLabel} est actif jusqu'au ${periodEnd}.`,
      title: "Merci, votre paiement est confirmé",
      paragraphs: [
        greeting(fullName),
        `Nous avons bien reçu votre paiement de ${amount}. Votre plan ${planLabel} est actif jusqu'au ${periodEnd}.`,
        `Votre reçu n° ${receiptNumber} est joint à cet e-mail. Vous le retrouverez aussi à tout moment dans votre espace, rubrique Abonnement.`,
      ],
      cta: { label: "Voir mon abonnement", url: billingUrl() },
    }),
  };
}

export function paymentFailedEmail({ fullName, amount, reason }: { fullName: string; amount: string; reason: string | null }) {
  return {
    subject: "Votre paiement QuickSign n'a pas abouti",
    ...renderEmail({
      preheader: "Aucun montant n'a été débité. Vous pouvez réessayer en un clic.",
      title: "Le paiement n'a pas abouti",
      paragraphs: [
        greeting(fullName),
        `Votre paiement de ${amount} n'a pas pu être finalisé${reason ? ` (${reason})` : ""}. Aucun abonnement n'a été facturé.`,
        "Vérifiez le solde de votre compte Mobile Money ou essayez un autre moyen de paiement.",
      ],
      cta: { label: "Réessayer le paiement", url: renewUrl() },
    }),
  };
}

/** Rappels de renouvellement : J-5, J-2 (bientôt expiré) et jour J. */
export function renewalReminderEmail({
  fullName,
  planLabel,
  endDate,
  daysLeft,
  price,
}: {
  fullName: string;
  planLabel: string;
  endDate: string;
  daysLeft: 0 | 2 | 5;
  price: string;
}) {
  const when = daysLeft === 0 ? "aujourd'hui" : `dans ${daysLeft} jours`;
  return {
    subject: daysLeft === 0 ? "Votre abonnement QuickSign expire aujourd'hui" : `Votre abonnement QuickSign expire ${when}`,
    ...renderEmail({
      preheader: `Renouvelez votre plan ${planLabel} (${price}) par Mobile Money ou carte.`,
      title: daysLeft === 0 ? "Votre abonnement expire aujourd'hui" : `Votre abonnement expire ${when}`,
      paragraphs: [
        greeting(fullName),
        `Votre plan ${planLabel} arrive à échéance le ${endDate}. Renouvelez-le (${price}) pour continuer à signer sans interruption. La nouvelle période commencera à la fin de l'actuelle : vous ne perdez aucun jour.`,
        "Après l'échéance, vous disposez encore de 3 jours pour renouveler avant le passage en lecture seule.",
      ],
      cta: { label: "Renouveler maintenant", url: renewUrl() },
    }),
  };
}

/** Échéance dépassée : période de grâce de 3 jours. */
export function graceStartedEmail({ fullName, graceEnd }: { fullName: string; graceEnd: string }) {
  return {
    subject: "Action requise : renouvelez votre abonnement QuickSign",
    ...renderEmail({
      preheader: `Accès maintenu jusqu'au ${graceEnd}, puis lecture seule.`,
      title: "Votre abonnement est arrivé à échéance",
      paragraphs: [
        greeting(fullName),
        `Nous n'avons pas encore reçu le paiement de renouvellement. Votre accès complet est maintenu jusqu'au ${graceEnd} ; ensuite, votre compte passera en lecture seule (aucune donnée supprimée).`,
      ],
      cta: { label: "Renouveler maintenant", url: renewUrl() },
    }),
  };
}

export function subscriptionExpiredEmail({ fullName }: { fullName: string }) {
  return {
    subject: "Votre compte QuickSign est en lecture seule",
    ...renderEmail({
      preheader: "Vos documents sont conservés. Réactivez votre plan quand vous voulez.",
      title: "Votre compte est en lecture seule",
      paragraphs: [
        greeting(fullName),
        "Votre abonnement a expiré. Vous pouvez toujours consulter et télécharger vos documents signés ; la signature, l'import et l'assistant sont suspendus.",
        "Toutes vos données sont conservées : réactivez votre plan à tout moment pour reprendre là où vous en étiez.",
      ],
      cta: { label: "Réactiver mon plan", url: renewUrl() },
    }),
  };
}

// ---------------------------------------------------------------------------
// Demandes de signature (Phase 7)
// ---------------------------------------------------------------------------

export function requestInvitationEmail({
  signerName,
  senderName,
  documentTitle,
  message,
  link,
  expiresAt,
  reminder = false,
}: {
  signerName: string;
  senderName: string;
  documentTitle: string;
  message: string | null;
  link: string;
  expiresAt: string | null;
  reminder?: boolean;
}) {
  return {
    subject: reminder
      ? `Rappel : « ${documentTitle} » attend votre signature`
      : `${senderName} vous invite à signer « ${documentTitle} »`,
    ...renderEmail({
      preheader: `Signature en ligne, sans compte, en moins d'une minute${expiresAt ? ` — avant le ${expiresAt}` : ""}.`,
      title: reminder ? "Votre signature est toujours attendue" : "Un document attend votre signature",
      paragraphs: [
        greeting(signerName),
        `${senderName} vous demande de signer le document « ${documentTitle} » avec QuickSign. Aucun compte n'est nécessaire : ouvrez le lien, lisez le document, puis signez avec le doigt ou la souris.`,
        ...(message ? [`Message de ${senderName} : « ${message} »`] : []),
        ...(expiresAt ? [`Ce lien est personnel et valable jusqu'au ${expiresAt}. Ne le transférez pas.`] : []),
      ],
      cta: { label: "Lire et signer le document", url: link },
      footnote: "Vous recevez cet e-mail car quelqu'un a indiqué votre adresse pour signer un document. Si vous ne connaissez pas l'expéditeur, ignorez-le.",
    }),
  };
}

export function requestDeclinedEmail({
  ownerName,
  signerName,
  documentTitle,
  reason,
  url,
}: {
  ownerName: string;
  signerName: string;
  documentTitle: string;
  reason: string;
  url: string;
}) {
  return {
    subject: `${signerName} a refusé de signer « ${documentTitle} »`,
    ...renderEmail({
      preheader: `Motif : ${reason}`,
      title: "Signature refusée",
      paragraphs: [greeting(ownerName), `${signerName} a refusé de signer « ${documentTitle} ».`, `Motif indiqué : « ${reason} »`],
      cta: { label: "Voir la demande", url },
    }),
  };
}

export function requestCompletedEmail({
  name,
  documentTitle,
  signerCount,
  verifyUrl,
  downloadUrl,
}: {
  name: string;
  documentTitle: string;
  signerCount: number;
  verifyUrl: string;
  downloadUrl: string | null;
}) {
  return {
    subject: `« ${documentTitle} » est signé par tous`,
    ...renderEmail({
      preheader: "Le document final et son certificat de signature sont joints.",
      title: "Document entièrement signé",
      paragraphs: [
        greeting(name),
        `Les ${signerCount} signataires ont signé « ${documentTitle} ». Le document final et le certificat de signature (chronologie, empreintes, adresses IP) sont joints à cet e-mail.`,
        `Chacun peut vérifier l'authenticité du document à tout moment : ${verifyUrl}`,
      ],
      cta: downloadUrl ? { label: "Télécharger le document signé", url: downloadUrl } : { label: "Vérifier le document", url: verifyUrl },
    }),
  };
}

export function requestExpiredEmail({ ownerName, documentTitle, url }: { ownerName: string; documentTitle: string; url: string }) {
  return {
    subject: `Demande expirée : « ${documentTitle} »`,
    ...renderEmail({
      preheader: "Tous les signataires n'ont pas signé avant la date limite.",
      title: "La demande de signature a expiré",
      paragraphs: [
        greeting(ownerName),
        `La date limite de la demande « ${documentTitle} » est dépassée avant que tous les signataires aient signé. Vous pouvez créer une nouvelle demande depuis le document.`,
      ],
      cta: { label: "Voir la demande", url },
    }),
  };
}

// ---------------------------------------------------------------------------
// Équipe (Phase 7)
// ---------------------------------------------------------------------------

export function teamInvitationEmail({
  inviterName,
  teamName,
  link,
  expiresAt,
}: {
  inviterName: string;
  teamName: string;
  link: string;
  expiresAt: string;
}) {
  return {
    subject: `${inviterName} vous invite à rejoindre ${teamName} sur QuickSign`,
    ...renderEmail({
      preheader: "Signez et faites signer vos documents avec votre équipe.",
      title: `Rejoignez l'équipe ${teamName}`,
      paragraphs: [
        "Bonjour,",
        `${inviterName} vous invite à rejoindre l'équipe « ${teamName} » sur QuickSign : modèles et cachets partagés, demandes de signature et plan Pro inclus.`,
        `L'invitation est valable jusqu'au ${expiresAt}. Si vous n'avez pas encore de compte, créez-le avec cette adresse e-mail puis ouvrez à nouveau ce lien.`,
      ],
      cta: { label: "Rejoindre l'équipe", url: link },
      footnote: "Si vous ne vous attendiez pas à cette invitation, ignorez simplement cet e-mail.",
    }),
  };
}
