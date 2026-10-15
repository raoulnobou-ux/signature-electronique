import { siteConfig } from "@/lib/site";
import type { LegalDoc } from "./types";

const mail = <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>;

/**
 * Suppression du compte et des données : page publique exigée par Google Play (lien
 * accessible sans l'application). Cohérente avec la politique de confidentialité (§ 5 et 6).
 */
export const deletionDoc: LegalDoc = {
  fr: {
    title: "Supprimer votre compte QuickSign",
    description: "Comment supprimer votre compte et vos données QuickSign, et ce qui est conservé.",
    body: (
      <>
        <h2>Depuis votre compte (recommandé)</h2>
        <ol>
          <li>Connectez-vous à QuickSign, sur le site ou dans l&apos;application.</li>
          <li>
            Ouvrez <strong>Paramètres → Zone sensible</strong>.
          </li>
          <li>
            Choisissez <strong>Supprimer mon compte</strong> et confirmez. Vous pouvez d&apos;abord{" "}
            <strong>exporter vos données</strong> (fichier JSON).
          </li>
        </ol>
        <p>La suppression est immédiate et définitive.</p>

        <h2>Sans accès à votre compte</h2>
        <p>
          Écrivez à {mail} depuis l&apos;adresse e-mail de votre compte, avec pour objet «
          Suppression de compte ». Nous vérifions que la demande vient bien de vous, puis nous
          supprimons le compte sous 30 jours au plus et vous le confirmons par e-mail.
        </p>

        <h2>Ce qui est supprimé</h2>
        <ul>
          <li>votre profil, vos réglages et votre photo ;</li>
          <li>vos documents, leurs versions et miniatures ;</li>
          <li>vos signatures, paraphes et cachets ;</li>
          <li>vos modèles, dossiers, étiquettes et conversations avec l&apos;assistant.</li>
        </ul>

        <h2>Ce qui est conservé, et pourquoi</h2>
        <ul>
          <li>
            <strong>Le journal de preuve des signatures</strong> : il prouve aussi la signature des
            autres personnes d&apos;un même document. Conservé 10 ans au plus.
          </li>
          <li>
            <strong>Le registre des paiements</strong> (montant, date, numéro de reçu) : obligation
            comptable, 10 ans, détaché de votre compte.
          </li>
          <li>
            Les sauvegardes techniques de l&apos;hébergeur sont effacées au fil de leur rotation.
          </li>
        </ul>
        <p>
          Les détails figurent dans la <a href="/confidentialite">politique de confidentialité</a>.
        </p>
      </>
    ),
  },
  en: {
    title: "Delete your QuickSign account",
    description: "How to delete your QuickSign account and data, and what is kept.",
    body: (
      <>
        <h2>From your account (recommended)</h2>
        <ol>
          <li>Sign in to QuickSign, on the website or in the app.</li>
          <li>
            Open <strong>Settings → Danger zone</strong>.
          </li>
          <li>
            Choose <strong>Delete my account</strong> and confirm. You can first{" "}
            <strong>export your data</strong> (JSON file).
          </li>
        </ol>
        <p>Deletion is immediate and permanent.</p>

        <h2>Without access to your account</h2>
        <p>
          Email {mail} from your account&apos;s email address, with the subject &quot;Account
          deletion&quot;. We check that the request comes from you, then delete the account within
          30 days at most and confirm by email.
        </p>

        <h2>What is deleted</h2>
        <ul>
          <li>your profile, settings and photo;</li>
          <li>your documents, their versions and thumbnails;</li>
          <li>your signatures, initials and stamps;</li>
          <li>your templates, folders, tags and assistant conversations.</li>
        </ul>

        <h2>What is kept, and why</h2>
        <ul>
          <li>
            <strong>The signature audit trail</strong>: it also proves the other signers of the same
            document. Kept 10 years at most.
          </li>
          <li>
            <strong>The payment record</strong> (amount, date, receipt number): accounting
            obligation, 10 years, detached from your account.
          </li>
          <li>The host&apos;s technical backups are erased as they rotate.</li>
        </ul>
        <p>
          Details are in the <a href="/confidentialite">privacy policy</a>.
        </p>
      </>
    ),
  },
};
