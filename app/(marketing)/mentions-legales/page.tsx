import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, hébergement et contact du service QuickSign.",
};

export default function LegalNoticePage() {
  return (
    <LegalPage title="Mentions légales" updatedAt="28 septembre 2026">
      <h2>Éditeur</h2>
      <p>
        QuickSign est édité par [raison sociale — à compléter], [forme juridique] au capital de
        [montant], dont le siège est situé [adresse complète], Cameroun.
        <br />
        Registre du commerce (RCCM) : [à compléter] — Numéro d&apos;identifiant unique (NIU) : [à
        compléter].
        <br />
        Directeur de la publication : [nom — à compléter].
      </p>

      <h2>Contact</h2>
      <p>
        E-mail : <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
        <br />
        Téléphone / WhatsApp : [à compléter]
      </p>

      <h2>Hébergement</h2>
      <p>
        Application : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.
        <br />
        Base de données et fichiers : Supabase Inc., région [à préciser lors de la mise en
        production].
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        La marque QuickSign, le logo, l&apos;interface et les contenus du site sont protégés. Toute
        reproduction non autorisée est interdite.
      </p>
    </LegalPage>
  );
}
