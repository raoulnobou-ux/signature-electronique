import {
  Database,
  Eye,
  FileCheck2,
  Fingerprint,
  KeyRound,
  Lock,
  ScrollText,
  ServerCog,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";

type Protection = { icon: LucideIcon; title: string; description: string };

export type SecurityContent = {
  badge: string;
  titleStart: string;
  titleHighlight: string;
  intro: string;
  protectionsTitle: string;
  protections: Protection[];
  dataTitle: string;
  dataIntro: string;
  /** Questions fréquentes sur les données : hébergement, chiffrement, accès, conservation. */
  data: { question: string; answer: string }[];
  legalTitle: string;
  legal: ReactNode;
  ctaTrial: string;
  ctaContact: string;
};

const icons = [
  Lock,
  Database,
  KeyRound,
  Fingerprint,
  ScrollText,
  FileCheck2,
  ShieldCheck,
  Eye,
  ServerCog,
];
const withIcons = (items: [string, string][]): Protection[] =>
  items.map(([title, description], i) => ({ icon: icons[i]!, title, description }));

const fr: SecurityContent = {
  badge: "Sécurité et validité juridique",
  titleStart: "Vos documents sont en sécurité.",
  titleHighlight: "Vos signatures, traçables.",
  intro:
    "Voici, en langage clair, comment QuickSign protège vos documents et ce que vaut juridiquement une signature réalisée avec notre service.",
  protectionsTitle: "Nos protections",
  protections: withIcons([
    [
      "Connexions et fichiers chiffrés",
      "Toutes les communications passent par HTTPS (TLS). Vos fichiers sont chiffrés au repos sur des serveurs professionnels.",
    ],
    [
      "Stockage privé, cloisonné par compte",
      "Chaque document est rangé dans un espace privé. Des règles appliquées par la base de données elle-même empêchent tout autre utilisateur d'y accéder.",
    ],
    [
      "Liens temporaires",
      "Un fichier n'est jamais accessible par une adresse publique : chaque ouverture passe par un lien signé qui expire au bout de quelques minutes.",
    ],
    [
      "Empreinte d'intégrité SHA-256",
      "Chaque PDF signé reçoit une empreinte numérique unique. La moindre modification ultérieure du fichier la change : toute falsification est détectable.",
    ],
    [
      "Journal d'audit infalsifiable",
      "Envoi, ouverture, signature : chaque événement est horodaté avec l'adresse IP et l'appareil, dans un journal en ajout seul : une fois enregistré, un événement ne peut plus être modifié ni supprimé.",
    ],
    [
      "Certificat de preuve vérifiable",
      "Pour chaque document signé à plusieurs, un certificat récapitule signataires, chronologie et empreintes, avec un QR code de vérification en ligne.",
    ],
    [
      "Paiements sécurisés",
      "Les paiements sont traités par pawaPay (Mobile Money) et Paddle (carte bancaire), prestataires spécialisés. Aucune donnée de carte ni code PIN ne transite ni n'est stocké chez QuickSign.",
    ],
    [
      "IA sous votre contrôle",
      "L'assistant ne lit le contenu d'un document que si vous le lui demandez explicitement. Vos documents ne servent jamais à entraîner des modèles.",
    ],
    [
      "Double authentification et sauvegardes",
      "Protégez votre compte par un code à usage unique (application d'authentification). Base de données sauvegardée automatiquement, erreurs surveillées en continu.",
    ],
  ]),
  dataTitle: "Vos données, en clair",
  dataIntro: "Les réponses simples aux questions que l'on nous pose le plus souvent.",
  data: [
    {
      question: "Où sont hébergées mes données ?",
      answer:
        "Dans l'Union européenne, à Paris : la base de données et les fichiers chez Supabase (infrastructure Amazon Web Services, région eu-west-3), l'application chez Vercel (région Paris). Ces hébergeurs sont audités selon la norme SOC 2.",
    },
    {
      question: "Mes fichiers sont-ils chiffrés ?",
      answer:
        "Oui, deux fois. Pendant le transfert, tout passe par HTTPS (TLS 1.2 ou plus récent). Au repos, la base de données, ses sauvegardes et tous les fichiers (documents, signatures, cachets, certificats, reçus) sont chiffrés en AES-256 par l'hébergeur. Aucun fichier n'est public : chaque ouverture passe par un lien signé qui expire au bout de quelques minutes.",
    },
    {
      question: "Qui peut voir mes documents ?",
      answer:
        "Vous seul. Les personnes que vous invitez à signer ne voient que le document concerné, par un lien personnel, secret et limité dans le temps. Les membres de votre équipe ne voient que ce que vous partagez explicitement (modèles, cachets). L'équipe QuickSign ne consulte jamais vos documents, sauf si vous le demandez par écrit pour une assistance. L'assistant IA ne lit un document que si vous le lui demandez.",
    },
    {
      question: "Quels prestataires traitent mes données ?",
      answer:
        "Uniquement ceux qui sont nécessaires au service : Supabase et Vercel (hébergement), Resend (envoi des e-mails), Anthropic (assistant IA, seulement à votre demande et sans entraînement sur vos données), pawaPay et Paddle (paiements). Aucune donnée n'est vendue ni utilisée à des fins publicitaires.",
    },
    {
      question: "Combien de temps sont-elles conservées ?",
      answer:
        "Vos documents restent disponibles tant que votre compte existe, même si l'abonnement expire (lecture seule). Un document mis à la corbeille est supprimé définitivement après 30 jours. Si vous supprimez votre compte, tous vos fichiers sont effacés immédiatement ; seul le journal d'audit des signatures est conservé, sans le contenu des documents, car il sert de preuve aux autres signataires.",
    },
    {
      question: "Comment exporter ou supprimer mes données ?",
      answer:
        "À tout moment, depuis Paramètres → Zone sensible : « Exporter mes données » télécharge immédiatement toutes vos informations (profil, liste des documents, demandes, paiements, journal d'audit), chaque fichier restant téléchargeable depuis l'application ; « Supprimer mon compte » efface définitivement votre compte et vos fichiers. Vous pouvez aussi écrire à supportquicksignapp@gmail.com.",
    },
  ],
  legalTitle: "Validité juridique",
  legal: (
    <>
      <h3>Ce que propose QuickSign</h3>
      <p>
        QuickSign permet de réaliser une <strong>signature électronique simple</strong> : vous
        apposez votre signature (dessinée, tapée ou importée) et, le cas échéant, le cachet de votre
        structure sur un document PDF. Sa valeur de preuve repose sur un ensemble d&apos;éléments de
        traçabilité :
      </p>
      <ul>
        <li>l&apos;horodatage de chaque signature (date et heure précises) ;</li>
        <li>
          l&apos;empreinte numérique SHA-256 du document avant et après signature, qui prouve son
          intégrité ;
        </li>
        <li>
          pour les demandes de signature, l&apos;identité déclarée de chaque signataire, son adresse
          e-mail ou son téléphone, l&apos;adresse IP et l&apos;appareil utilisés ;
        </li>
        <li>
          un journal d&apos;audit non modifiable et un certificat de signature vérifiable en ligne.
        </li>
      </ul>
      <h3>Dans quels cas l&apos;utiliser</h3>
      <p>
        Une signature électronique simple convient à la grande majorité des documents courants :
        contrats commerciaux, lettres de mission, bons de commande, attestations, courriers,
        procès-verbaux, notes internes et annonces. En cas de contestation, les éléments de
        traçabilité permettent d&apos;établir qui a signé quoi, et quand.
      </p>
      <h3>Les limites à connaître</h3>
      <p>
        QuickSign <strong>n&apos;est pas</strong> une signature électronique qualifiée délivrée par
        un prestataire de services de confiance agréé. Certains actes exigent une forme particulière
        ou l&apos;intervention d&apos;un officier public, par exemple :
      </p>
      <ul>
        <li>les actes authentiques et notariés ;</li>
        <li>certains actes administratifs, fiscaux ou de procédure ;</li>
        <li>les actes pour lesquels un texte impose une signature manuscrite ou qualifiée.</li>
      </ul>
      <p>
        Pour ces documents, ou en cas de doute sur un document à fort enjeu, nous vous recommandons
        de vérifier auprès d&apos;un juriste ou d&apos;un avocat.
      </p>
      <h3>Cadre de référence</h3>
      <p>
        Au Cameroun, la reconnaissance de l&apos;écrit et de la signature électroniques
        s&apos;appuie notamment sur la loi n° 2010/012 du 21 décembre 2010 relative à la
        cybersécurité et à la cybercriminalité et sur la loi n° 2010/021 du 21 décembre 2010
        régissant le commerce électronique, ainsi que sur les textes OHADA applicables, dont
        l&apos;Acte uniforme relatif au droit commercial général. La valeur d&apos;une signature
        dépend toujours du document concerné et du contexte : ces références sont données à titre
        d&apos;information et ne constituent pas un avis juridique.
      </p>
      <h3>Nos engagements</h3>
      <ul>
        <li>
          Ne jamais présenter QuickSign comme une signature qualifiée ou une garantie légale
          absolue.
        </li>
        <li>
          Conserver vos documents et journaux d&apos;audit sans les modifier, même si votre
          abonnement expire.
        </li>
        <li>Vous permettre à tout moment d&apos;exporter vos données et vos preuves.</li>
      </ul>
    </>
  ),
  ctaTrial: "Essayer gratuitement 6 jours",
  ctaContact: "Poser une question",
};

const en: SecurityContent = {
  badge: "Security and legal validity",
  titleStart: "Your documents are safe.",
  titleHighlight: "Your signatures, traceable.",
  intro:
    "Here is, in plain language, how QuickSign protects your documents and what a signature made with our service is worth legally.",
  protectionsTitle: "Our safeguards",
  protections: withIcons([
    [
      "Encrypted connections and files",
      "All communications go through HTTPS (TLS). Your files are encrypted at rest on professional servers.",
    ],
    [
      "Private storage, isolated per account",
      "Each document is kept in a private space. Rules enforced by the database itself prevent any other user from accessing it.",
    ],
    [
      "Temporary links",
      "A file is never reachable through a public address: each opening goes through a signed link that expires after a few minutes.",
    ],
    [
      "SHA-256 integrity fingerprint",
      "Each signed PDF receives a unique digital fingerprint. The slightest later change to the file alters it: any tampering is detectable.",
    ],
    [
      "Tamper-proof audit log",
      "Sending, opening, signing: every event is timestamped with the IP address and device, in an append-only log: once recorded, an event can no longer be changed or deleted.",
    ],
    [
      "Verifiable proof certificate",
      "For every document signed by several people, a certificate summarizes signers, timeline and fingerprints, with a QR code for online verification.",
    ],
    [
      "Secure payments",
      "Payments are processed by pawaPay (Mobile Money) and Paddle (card), specialised providers. No card data or PIN ever passes through or is stored at QuickSign.",
    ],
    [
      "AI under your control",
      "The assistant only reads a document's content when you explicitly ask it to. Your documents are never used to train models.",
    ],
    [
      "Two-factor authentication and backups",
      "Protect your account with a one-time code (authenticator app). The database is backed up automatically, and errors are monitored continuously.",
    ],
  ]),
  dataTitle: "Your data, plainly",
  dataIntro: "Straight answers to the questions we're asked most often.",
  data: [
    {
      question: "Where is my data hosted?",
      answer:
        "In the European Union, in Paris: the database and files at Supabase (Amazon Web Services infrastructure, eu-west-3 region), the application at Vercel (Paris region). Both hosts are SOC 2 audited.",
    },
    {
      question: "Are my files encrypted?",
      answer:
        "Yes, twice. In transit, everything goes over HTTPS (TLS 1.2 or later). At rest, the database, its backups and every file (documents, signatures, stamps, certificates, receipts) are encrypted with AES-256 by the host. No file is public: every access goes through a signed link that expires within minutes.",
    },
    {
      question: "Who can see my documents?",
      answer:
        "Only you. People you invite to sign only see the document concerned, through a personal, secret, time-limited link. Your team members only see what you explicitly share (templates, stamps). The QuickSign team never looks at your documents unless you ask us in writing for support. The AI assistant only reads a document when you ask it to.",
    },
    {
      question: "Which providers process my data?",
      answer:
        "Only those the service needs: Supabase and Vercel (hosting), Resend (emails), Anthropic (AI assistant, only at your request and never trained on your data), pawaPay and Paddle (payments). No data is ever sold or used for advertising.",
    },
    {
      question: "How long is it kept?",
      answer:
        "Your documents stay available as long as your account exists, even if your subscription lapses (read-only). A document moved to the trash is permanently deleted after 30 days. If you delete your account, all your files are erased immediately; only the signing audit log is kept, without document content, because it is evidence for the other signers.",
    },
    {
      question: "How do I export or delete my data?",
      answer:
        "Anytime, from Settings → Danger zone: “Export my data” instantly downloads all your information (profile, document list, requests, payments, audit log), with every file still downloadable from the app; “Delete my account” permanently erases your account and files. You can also write to supportquicksignapp@gmail.com.",
    },
  ],
  legalTitle: "Legal validity",
  legal: (
    <>
      <h3>What QuickSign offers</h3>
      <p>
        QuickSign lets you create a <strong>simple electronic signature</strong>: you place your
        signature (drawn, typed or uploaded) and, where relevant, your organization&apos;s stamp on
        a PDF document. Its evidential value relies on a set of traceability elements:
      </p>
      <ul>
        <li>the timestamp of each signature (exact date and time);</li>
        <li>
          the SHA-256 digital fingerprint of the document before and after signing, which proves its
          integrity;
        </li>
        <li>
          for signature requests, each signer&apos;s declared identity, email address or phone
          number, and the IP address and device used;
        </li>
        <li>a non-modifiable audit log and a signature certificate that can be verified online.</li>
      </ul>
      <h3>When to use it</h3>
      <p>
        A simple electronic signature is suitable for the vast majority of everyday documents:
        commercial contracts, engagement letters, purchase orders, certificates, letters, minutes,
        internal memos and announcements. In case of dispute, the traceability elements make it
        possible to establish who signed what, and when.
      </p>
      <h3>Limits to be aware of</h3>
      <p>
        QuickSign <strong>is not</strong> a qualified electronic signature issued by an accredited
        trust service provider. Some deeds require a specific form or the involvement of a public
        officer, for example:
      </p>
      <ul>
        <li>authentic and notarial deeds;</li>
        <li>certain administrative, tax or procedural acts;</li>
        <li>acts for which a law requires a handwritten or qualified signature.</li>
      </ul>
      <p>
        For these documents, or if in doubt about a high-stakes document, we recommend checking with
        a lawyer.
      </p>
      <h3>Legal framework</h3>
      <p>
        In Cameroon, the recognition of electronic writing and signatures relies in particular on
        Law No. 2010/012 of 21 December 2010 on cybersecurity and cybercrime and Law No. 2010/021 of
        21 December 2010 governing electronic commerce, as well as the applicable OHADA texts,
        including the Uniform Act on General Commercial Law. The value of a signature always depends
        on the document and context: these references are given for information only and do not
        constitute legal advice.
      </p>
      <h3>Our commitments</h3>
      <ul>
        <li>Never present QuickSign as a qualified signature or an absolute legal guarantee.</li>
        <li>Keep your documents and audit logs unchanged, even if your subscription expires.</li>
        <li>Let you export your data and your evidence at any time.</li>
      </ul>
    </>
  ),
  ctaTrial: "Try free for 6 days",
  ctaContact: "Ask a question",
};

export const securityContent: Record<Locale, SecurityContent> = { fr, en };
