import { siteConfig } from "@/lib/site";
import type { LegalDoc } from "./types";

const mail = <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>;

/** Mentions légales. Les champs entre crochets sont à compléter par l'éditeur. */
export const noticeDoc: LegalDoc = {
  fr: {
    title: "Mentions légales",
    description: "Éditeur, hébergement et contact du service QuickSign.",
    body: (
      <>
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
          E-mail : {mail}
          <br />
          Téléphone / WhatsApp : [à compléter]
        </p>

        <h2>Hébergement</h2>
        <ul>
          <li>
            Application : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis
            (traitement à Paris).
          </li>
          <li>
            Base de données et fichiers : Supabase Inc., données hébergées dans l&apos;Union
            européenne (Paris).
          </li>
          <li>Conversion des documents : Fly.io Inc., Chicago, États-Unis (traitement à Paris).</li>
        </ul>

        <h2>Propriété intellectuelle</h2>
        <p>
          La marque QuickSign, le logo, l&apos;interface et les contenus du site sont protégés.
          Toute reproduction non autorisée est interdite.
        </p>
      </>
    ),
  },
  en: {
    title: "Legal notice",
    description: "Publisher, hosting and contact for the QuickSign service.",
    body: (
      <>
        <h2>Publisher</h2>
        <p>
          QuickSign is published by [company name — to be completed], [legal form] with a share
          capital of [amount], whose registered office is at [full address], Cameroon.
          <br />
          Trade register (RCCM): [to be completed] — Tax identification number (NIU): [to be
          completed].
          <br />
          Publication director: [name — to be completed].
        </p>

        <h2>Contact</h2>
        <p>
          Email: {mail}
          <br />
          Phone / WhatsApp: [to be completed]
        </p>

        <h2>Hosting</h2>
        <ul>
          <li>
            Application: Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States
            (processing in Paris).
          </li>
          <li>Database and files: Supabase Inc., data hosted in the European Union (Paris).</li>
          <li>Document conversion: Fly.io Inc., Chicago, United States (processing in Paris).</li>
        </ul>

        <h2>Intellectual property</h2>
        <p>
          The QuickSign brand, logo, interface and site content are protected. Any unauthorized
          reproduction is prohibited.
        </p>
      </>
    ),
  },
};
