import type { Locale } from "@/i18n/config";
import { siteConfig } from "@/lib/site";
import { firstName } from "@/lib/utils";
import { renderEmail } from "./layout";

/**
 * E-mails transactionnels de QuickSign, en français ou en anglais selon la langue du
 * destinataire (profil). Les dates et montants arrivent déjà formatés dans cette langue.
 */

type L = { locale?: Locale };
const isEn = (locale?: Locale) => locale === "en";

export function welcomeEmail({ fullName, locale }: { fullName: string } & L) {
  const name = firstName(fullName);
  if (isEn(locale))
    return {
      subject: "Welcome to QuickSign — your account is ready",
      ...renderEmail(
        {
          preheader: "Your free account is active: try QuickSign with your first document.",
          title: name ? `Welcome, ${name}!` : "Welcome to QuickSign!",
          paragraphs: [
            "Your account is active. For free, you can import a document, open the editor and create your signature. Subscribe whenever you are ready to sign and export: signatures, stamps, multiple signers, AI assistant.",
            "To get started: create your signature, add your organization's stamp, then import your first document. It takes less than a minute.",
            "Any questions? Just reply to this email, we're happy to help.",
          ],
          cta: { label: "Import my first document", url: `${siteConfig.url}/app/bienvenue` },
          footnote: "You are receiving this email because you just created a QuickSign account.",
        },
        locale,
      ),
    };
  return {
    subject: "Bienvenue sur QuickSign — votre compte est prêt",
    ...renderEmail({
      preheader:
        "Votre compte gratuit est actif : découvrez QuickSign avec votre premier document.",
      title: name ? `Bienvenue, ${name} !` : "Bienvenue sur QuickSign !",
      paragraphs: [
        "Votre compte est activé. Gratuitement, vous pouvez importer un document, ouvrir l'éditeur et créer votre signature. Abonnez-vous quand vous êtes prêt pour signer et exporter : signatures, cachets, envoi à plusieurs signataires, assistant IA.",
        "Pour bien démarrer : créez votre signature, ajoutez le cachet de votre structure, puis importez votre premier document. Comptez moins d'une minute.",
        "Une question ? Répondez simplement à cet e-mail, nous vous aidons avec plaisir.",
      ],
      cta: { label: "Importer mon premier document", url: `${siteConfig.url}/app/bienvenue` },
      footnote: "Vous recevez cet e-mail car vous venez de créer un compte QuickSign.",
    }),
  };
}

// ---------------------------------------------------------------------------
// Abonnement et paiements (Phase 6)
// ---------------------------------------------------------------------------

const billingUrl = () => `${siteConfig.url}/app/abonnement`;
const renewUrl = () => `${siteConfig.url}/app/abonnement#plans`;
const greeting = (fullName: string, locale?: Locale) => {
  const name = firstName(fullName);
  if (isEn(locale)) return name ? `Hello ${name},` : "Hello,";
  return name ? `Bonjour ${name},` : "Bonjour,";
};

/** Nom du plan dans la langue de l'e-mail. */
export function planName(plan: "essential" | "pro", locale?: Locale): string {
  return plan === "pro" ? "Pro" : isEn(locale) ? "Essential" : "Essentiel";
}

/** J-2 avant la fin de l'essai. */
export function trialEndingEmail({
  fullName,
  endDate,
  locale,
}: { fullName: string; endDate: string } & L) {
  if (isEn(locale))
    return {
      subject: "Your QuickSign trial ends in 2 days",
      ...renderEmail(
        {
          preheader: `Trial ends on ${endDate}. Your documents stay safe.`,
          title: "Only 2 trial days left",
          paragraphs: [
            greeting(fullName, locale),
            `Your free Pro trial ends on ${endDate}. To keep signing without interruption, choose a plan, priced in your currency and payable by card or Mobile Money.`,
            "Your remaining trial days are kept: your subscription will start when the trial ends.",
          ],
          cta: { label: "Choose my plan", url: renewUrl() },
        },
        locale,
      ),
    };
  return {
    subject: "Votre essai QuickSign se termine dans 2 jours",
    ...renderEmail({
      preheader: `Fin de l'essai le ${endDate}. Vos documents restent en sécurité.`,
      title: "Plus que 2 jours d'essai",
      paragraphs: [
        greeting(fullName),
        `Votre essai gratuit du plan Pro se termine le ${endDate}. Pour continuer à signer sans interruption, choisissez un plan, au prix de votre pays, payable par carte ou Mobile Money.`,
        "Les jours d'essai restants sont conservés : votre abonnement commencera à la fin de l'essai.",
      ],
      cta: { label: "Choisir mon plan", url: renewUrl() },
    }),
  };
}

/** L'essai est terminé : le compte passe en accès gratuit. */
export function trialEndedEmail({ fullName, locale }: { fullName: string } & L) {
  if (isEn(locale))
    return {
      subject: "Your QuickSign trial has ended",
      ...renderEmail(
        {
          preheader: "Your documents are kept. Choose a plan to sign again.",
          title: "Your trial has ended",
          paragraphs: [
            greeting(fullName, locale),
            "Your free trial has come to an end. Your account now has free access: you can still view and download your documents. Nothing is deleted.",
            "To sign new documents, choose a plan in a few seconds.",
          ],
          cta: { label: "Reactivate my account", url: renewUrl() },
        },
        locale,
      ),
    };
  return {
    subject: "Votre essai QuickSign est terminé",
    ...renderEmail({
      preheader: "Vos documents sont conservés. Choisissez un plan pour signer à nouveau.",
      title: "Votre essai est terminé",
      paragraphs: [
        greeting(fullName),
        "Votre essai gratuit est arrivé à son terme. Votre compte passe en accès gratuit : vous pouvez toujours consulter et télécharger vos documents. Rien n'est supprimé.",
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
  locale,
}: {
  fullName: string;
  planLabel: string;
  amount: string;
  periodEnd: string;
  receiptNumber: string;
} & L) {
  if (isEn(locale))
    return {
      subject: `Payment received — receipt ${receiptNumber}`,
      ...renderEmail(
        {
          preheader: `Your ${planLabel} plan is active until ${periodEnd}.`,
          title: "Thank you, your payment is confirmed",
          paragraphs: [
            greeting(fullName, locale),
            `We have received your payment of ${amount}. Your ${planLabel} plan is active until ${periodEnd}.`,
            `Your receipt No. ${receiptNumber} is attached to this email. You can also find it at any time in your workspace, under Subscription.`,
          ],
          cta: { label: "View my subscription", url: billingUrl() },
        },
        locale,
      ),
    };
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

export function paymentFailedEmail({
  fullName,
  amount,
  reason,
  locale,
}: { fullName: string; amount: string; reason: string | null } & L) {
  if (isEn(locale))
    return {
      subject: "Your QuickSign payment didn't go through",
      ...renderEmail(
        {
          preheader: "No amount was charged. You can try again in one click.",
          title: "The payment didn't go through",
          paragraphs: [
            greeting(fullName, locale),
            `Your payment of ${amount} couldn't be completed${reason ? ` (${reason})` : ""}. No subscription was charged.`,
            "Check your Mobile Money balance or try another payment method.",
          ],
          cta: { label: "Retry the payment", url: renewUrl() },
        },
        locale,
      ),
    };
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
  locale,
}: {
  fullName: string;
  planLabel: string;
  endDate: string;
  daysLeft: 0 | 2 | 5;
  price: string;
} & L) {
  if (isEn(locale)) {
    const when = daysLeft === 0 ? "today" : `in ${daysLeft} days`;
    return {
      subject: `Your QuickSign subscription expires ${when}`,
      ...renderEmail(
        {
          preheader: `Renew your ${planLabel} plan (${price}) with Mobile Money or card.`,
          title: `Your subscription expires ${when}`,
          paragraphs: [
            greeting(fullName, locale),
            `Your ${planLabel} plan expires on ${endDate}. Renew it (${price}) to keep signing without interruption. The new period starts at the end of the current one: you don't lose a single day.`,
            "After the due date, you still have 3 days to renew before signing is paused.",
          ],
          cta: { label: "Renew now", url: renewUrl() },
        },
        locale,
      ),
    };
  }
  const when = daysLeft === 0 ? "aujourd'hui" : `dans ${daysLeft} jours`;
  return {
    subject:
      daysLeft === 0
        ? "Votre abonnement QuickSign expire aujourd'hui"
        : `Votre abonnement QuickSign expire ${when}`,
    ...renderEmail({
      preheader: `Renouvelez votre plan ${planLabel} (${price}) par Mobile Money ou carte.`,
      title:
        daysLeft === 0 ? "Votre abonnement expire aujourd'hui" : `Votre abonnement expire ${when}`,
      paragraphs: [
        greeting(fullName),
        `Votre plan ${planLabel} arrive à échéance le ${endDate}. Renouvelez-le (${price}) pour continuer à signer sans interruption. La nouvelle période commencera à la fin de l'actuelle : vous ne perdez aucun jour.`,
        "Après l'échéance, vous disposez encore de 3 jours pour renouveler avant la suspension de la signature.",
      ],
      cta: { label: "Renouveler maintenant", url: renewUrl() },
    }),
  };
}

/** Échéance dépassée : période de grâce de 3 jours. */
export function graceStartedEmail({
  fullName,
  graceEnd,
  locale,
}: { fullName: string; graceEnd: string } & L) {
  if (isEn(locale))
    return {
      subject: "Action required: renew your QuickSign subscription",
      ...renderEmail(
        {
          preheader: `Full access kept until ${graceEnd}.`,
          title: "Your subscription has expired",
          paragraphs: [
            greeting(fullName, locale),
            `We haven't received the renewal payment yet. Your full access is kept until ${graceEnd}; after that, your account returns to free access (no data deleted).`,
          ],
          cta: { label: "Renew now", url: renewUrl() },
        },
        locale,
      ),
    };
  return {
    subject: "Action requise : renouvelez votre abonnement QuickSign",
    ...renderEmail({
      preheader: `Accès complet maintenu jusqu'au ${graceEnd}.`,
      title: "Votre abonnement est arrivé à échéance",
      paragraphs: [
        greeting(fullName),
        `Nous n'avons pas encore reçu le paiement de renouvellement. Votre accès complet est maintenu jusqu'au ${graceEnd} ; ensuite, votre compte repassera en accès gratuit (aucune donnée supprimée).`,
      ],
      cta: { label: "Renouveler maintenant", url: renewUrl() },
    }),
  };
}

export function subscriptionExpiredEmail({ fullName, locale }: { fullName: string } & L) {
  if (isEn(locale))
    return {
      subject: "Your QuickSign subscription has ended",
      ...renderEmail(
        {
          preheader: "Your documents are kept. Reactivate your plan whenever you like.",
          title: "Your subscription has ended",
          paragraphs: [
            greeting(fullName, locale),
            "Your subscription has expired and your account is back on free access. You can still view and download your documents; signing and export are paused.",
            "All your data is kept: reactivate your plan at any time to pick up where you left off.",
          ],
          cta: { label: "Reactivate my plan", url: renewUrl() },
        },
        locale,
      ),
    };
  return {
    subject: "Votre abonnement QuickSign est terminé",
    ...renderEmail({
      preheader: "Vos documents sont conservés. Réactivez votre plan quand vous voulez.",
      title: "Votre abonnement est terminé",
      paragraphs: [
        greeting(fullName),
        "Votre abonnement a expiré et votre compte repasse en accès gratuit. Vous pouvez toujours consulter et télécharger vos documents ; la signature et l'export sont suspendus.",
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
  locale,
}: {
  signerName: string;
  senderName: string;
  documentTitle: string;
  message: string | null;
  link: string;
  expiresAt: string | null;
  reminder?: boolean;
} & L) {
  if (isEn(locale))
    return {
      subject: reminder
        ? `Reminder: “${documentTitle}” is awaiting your signature`
        : `${senderName} invites you to sign “${documentTitle}”`,
      ...renderEmail(
        {
          preheader: `Sign online, no account, in less than a minute${expiresAt ? ` — before ${expiresAt}` : ""}.`,
          title: reminder
            ? "Your signature is still awaited"
            : "A document is awaiting your signature",
          paragraphs: [
            greeting(signerName, locale),
            `${senderName} asks you to sign the document “${documentTitle}” with QuickSign. No account is needed: open the link, read the document, then sign with your finger or the mouse.`,
            ...(message ? [`Message from ${senderName}: “${message}”`] : []),
            ...(expiresAt
              ? [`This link is personal and valid until ${expiresAt}. Do not forward it.`]
              : []),
          ],
          cta: { label: "Read and sign the document", url: link },
          footnote:
            "You are receiving this email because someone entered your address to sign a document. If you don't know the sender, ignore it.",
        },
        locale,
      ),
    };
  return {
    subject: reminder
      ? `Rappel : « ${documentTitle} » attend votre signature`
      : `${senderName} vous invite à signer « ${documentTitle} »`,
    ...renderEmail({
      preheader: `Signature en ligne, sans compte, en moins d'une minute${expiresAt ? ` — avant le ${expiresAt}` : ""}.`,
      title: reminder
        ? "Votre signature est toujours attendue"
        : "Un document attend votre signature",
      paragraphs: [
        greeting(signerName),
        `${senderName} vous demande de signer le document « ${documentTitle} » avec QuickSign. Aucun compte n'est nécessaire : ouvrez le lien, lisez le document, puis signez avec le doigt ou la souris.`,
        ...(message ? [`Message de ${senderName} : « ${message} »`] : []),
        ...(expiresAt
          ? [`Ce lien est personnel et valable jusqu'au ${expiresAt}. Ne le transférez pas.`]
          : []),
      ],
      cta: { label: "Lire et signer le document", url: link },
      footnote:
        "Vous recevez cet e-mail car quelqu'un a indiqué votre adresse pour signer un document. Si vous ne connaissez pas l'expéditeur, ignorez-le.",
    }),
  };
}

export function requestDeclinedEmail({
  ownerName,
  signerName,
  documentTitle,
  reason,
  url,
  locale,
}: {
  ownerName: string;
  signerName: string;
  documentTitle: string;
  reason: string;
  url: string;
} & L) {
  if (isEn(locale))
    return {
      subject: `${signerName} declined to sign “${documentTitle}”`,
      ...renderEmail(
        {
          preheader: `Reason: ${reason}`,
          title: "Signature declined",
          paragraphs: [
            greeting(ownerName, locale),
            `${signerName} declined to sign “${documentTitle}”.`,
            `Reason given: “${reason}”`,
          ],
          cta: { label: "View the request", url },
        },
        locale,
      ),
    };
  return {
    subject: `${signerName} a refusé de signer « ${documentTitle} »`,
    ...renderEmail({
      preheader: `Motif : ${reason}`,
      title: "Signature refusée",
      paragraphs: [
        greeting(ownerName),
        `${signerName} a refusé de signer « ${documentTitle} ».`,
        `Motif indiqué : « ${reason} »`,
      ],
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
  locale,
}: {
  name: string;
  documentTitle: string;
  signerCount: number;
  verifyUrl: string;
  downloadUrl: string | null;
} & L) {
  if (isEn(locale))
    return {
      subject: `“${documentTitle}” is signed by everyone`,
      ...renderEmail(
        {
          preheader: "The final document and its signature certificate are attached.",
          title: "Document fully signed",
          paragraphs: [
            greeting(name, locale),
            `All ${signerCount} signers have signed “${documentTitle}”. The final document and the signature certificate (timeline, fingerprints, IP addresses) are attached to this email.`,
            `Anyone can check the document's authenticity at any time: ${verifyUrl}`,
          ],
          cta: downloadUrl
            ? { label: "Download the signed document", url: downloadUrl }
            : { label: "Verify the document", url: verifyUrl },
        },
        locale,
      ),
    };
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
      cta: downloadUrl
        ? { label: "Télécharger le document signé", url: downloadUrl }
        : { label: "Vérifier le document", url: verifyUrl },
    }),
  };
}

export function requestExpiredEmail({
  ownerName,
  documentTitle,
  url,
  locale,
}: { ownerName: string; documentTitle: string; url: string } & L) {
  if (isEn(locale))
    return {
      subject: `Request expired: “${documentTitle}”`,
      ...renderEmail(
        {
          preheader: "Not all signers signed before the deadline.",
          title: "The signature request has expired",
          paragraphs: [
            greeting(ownerName, locale),
            `The deadline of the request “${documentTitle}” passed before all signers had signed. You can create a new request from the document.`,
          ],
          cta: { label: "View the request", url },
        },
        locale,
      ),
    };
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
  locale,
}: {
  inviterName: string;
  teamName: string;
  link: string;
  expiresAt: string;
} & L) {
  if (isEn(locale))
    return {
      subject: `${inviterName} invites you to join ${teamName} on QuickSign`,
      ...renderEmail(
        {
          preheader: "Sign and get documents signed with your team.",
          title: `Join the ${teamName} team`,
          paragraphs: [
            "Hello,",
            `${inviterName} invites you to join the “${teamName}” team on QuickSign: shared templates and stamps, signature requests and the Pro plan included.`,
            `The invitation is valid until ${expiresAt}. If you don't have an account yet, create one with this email address then open this link again.`,
          ],
          cta: { label: "Join the team", url: link },
          footnote: "If you weren't expecting this invitation, simply ignore this email.",
        },
        locale,
      ),
    };
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
