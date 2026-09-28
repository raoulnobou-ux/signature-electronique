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
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AmbientBackground } from "@/components/brand/ambient-background";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("security");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

const protections: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Lock,
    title: "Connexions et fichiers chiffrés",
    description:
      "Toutes les communications passent par HTTPS (TLS). Vos fichiers sont chiffrés au repos sur des serveurs professionnels.",
  },
  {
    icon: Database,
    title: "Stockage privé, cloisonné par compte",
    description:
      "Chaque document est rangé dans un espace privé. Des règles appliquées par la base de données elle-même empêchent tout autre utilisateur d'y accéder.",
  },
  {
    icon: KeyRound,
    title: "Liens temporaires",
    description:
      "Un fichier n'est jamais accessible par une adresse publique : chaque ouverture passe par un lien signé qui expire au bout de quelques minutes.",
  },
  {
    icon: Fingerprint,
    title: "Empreinte d'intégrité SHA-256",
    description:
      "Chaque PDF signé reçoit une empreinte numérique unique. La moindre modification ultérieure du fichier la change : toute falsification est détectable.",
  },
  {
    icon: ScrollText,
    title: "Journal d'audit infalsifiable",
    description:
      "Envoi, ouverture, signature : chaque événement est horodaté avec l'adresse IP et l'appareil, dans un journal en ajout seul : une fois enregistré, un événement ne peut plus être modifié ni supprimé.",
  },
  {
    icon: FileCheck2,
    title: "Certificat de preuve vérifiable",
    description:
      "Pour chaque document signé à plusieurs, un certificat récapitule signataires, chronologie et empreintes, avec un QR code de vérification en ligne.",
  },
  {
    icon: ShieldCheck,
    title: "Paiements sécurisés",
    description:
      "Les paiements Mobile Money et carte sont traités par un prestataire certifié. Aucune donnée de carte ne transite ni n'est stockée chez QuickSign.",
  },
  {
    icon: Eye,
    title: "IA sous votre contrôle",
    description:
      "L'assistant ne lit le contenu d'un document que si vous le lui demandez explicitement. Vos documents ne servent jamais à entraîner des modèles.",
  },
  {
    icon: ServerCog,
    title: "Sauvegardes et surveillance",
    description:
      "Base de données sauvegardée automatiquement, erreurs surveillées en continu, accès limité au strict nécessaire.",
  },
];

export default function SecurityPage() {
  return (
    <div className="relative isolate">
      <AmbientBackground intensity="subtle" />
      <section className="mx-auto max-w-4xl px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-20">
        <Badge variant="outline" className="mb-5 glass px-3 py-1 text-foreground">
          <ShieldCheck aria-hidden /> Sécurité et validité juridique
        </Badge>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Vos documents sont en sécurité.{" "}
          <span className="text-gradient">Vos signatures, traçables.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">
          Voici, en langage clair, comment QuickSign protège vos documents et ce que vaut
          juridiquement une signature réalisée avec notre service.
        </p>
      </section>

      <section aria-labelledby="protections-title" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h2 id="protections-title" className="sr-only">
          Nos protections
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {protections.map(({ icon: Icon, title, description }) => (
            <li key={title} className="reveal rounded-3xl glass p-6">
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent">
                <Icon className="size-5 text-accent-foreground" aria-hidden />
              </div>
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="validite-juridique"
        aria-labelledby="legal-title"
        className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16 sm:px-6"
      >
        <div className="prose max-w-none prose-neutral dark:prose-invert prose-headings:font-display prose-headings:tracking-tight">
          <h2 id="legal-title" className="text-3xl sm:text-4xl">
            Validité juridique
          </h2>

          <h3>Ce que propose QuickSign</h3>
          <p>
            QuickSign permet de réaliser une <strong>signature électronique simple</strong> : vous
            apposez votre signature (dessinée, tapée ou importée) et, le cas échéant, le cachet de
            votre structure sur un document PDF. Sa valeur de preuve repose sur un ensemble
            d&apos;éléments de traçabilité :
          </p>
          <ul>
            <li>l&apos;horodatage de chaque signature (date et heure précises) ;</li>
            <li>
              l&apos;empreinte numérique SHA-256 du document avant et après signature, qui prouve
              son intégrité ;
            </li>
            <li>
              pour les demandes de signature, l&apos;identité déclarée de chaque signataire, son
              adresse e-mail ou son téléphone, l&apos;adresse IP et l&apos;appareil utilisés ;
            </li>
            <li>
              un journal d&apos;audit non modifiable et un certificat de signature vérifiable en
              ligne.
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
            QuickSign <strong>n&apos;est pas</strong> une signature électronique qualifiée délivrée
            par un prestataire de services de confiance agréé. Certains actes exigent une forme
            particulière ou l&apos;intervention d&apos;un officier public, par exemple :
          </p>
          <ul>
            <li>les actes authentiques et notariés ;</li>
            <li>certains actes administratifs, fiscaux ou de procédure ;</li>
            <li>les actes pour lesquels un texte impose une signature manuscrite ou qualifiée.</li>
          </ul>
          <p>
            Pour ces documents, ou en cas de doute sur un document à fort enjeu, nous vous
            recommandons de vérifier auprès d&apos;un juriste ou d&apos;un avocat.
          </p>

          <h3>Cadre de référence</h3>
          <p>
            Au Cameroun, la reconnaissance de l&apos;écrit et de la signature électroniques
            s&apos;appuie notamment sur la loi n° 2010/012 du 21 décembre 2010 relative à la
            cybersécurité et à la cybercriminalité et sur la loi n° 2010/021 du 21 décembre 2010
            régissant le commerce électronique, ainsi que sur les textes OHADA applicables, dont
            l&apos;Acte uniforme relatif au droit commercial général. La valeur d&apos;une signature
            dépend toujours du document concerné et du contexte : ces références sont données à
            titre d&apos;information et ne constituent pas un avis juridique.
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
        </div>

        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/inscription">Essayer gratuitement 6 jours</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/contact">Poser une question</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
