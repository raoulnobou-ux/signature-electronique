import Link from "next/link";
import { siteConfig } from "@/lib/site";
import type { LegalDoc } from "./types";

const mail = <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>;

/**
 * Politique de confidentialité. Chaque affirmation correspond au fonctionnement réel du
 * code (prestataires, régions, durées de conservation, cookies) : la mettre à jour avec lui.
 */
export const privacyDoc: LegalDoc = {
  fr: {
    title: "Politique de confidentialité",
    description:
      "Quelles données QuickSign traite, pourquoi, avec qui, combien de temps, et vos droits.",
    body: (
      <>
        <p>
          Cette politique explique quelles données personnelles QuickSign traite, dans quel but,
          avec quels prestataires, pendant combien de temps, et comment exercer vos droits. Nous
          appliquons les principes du Règlement général sur la protection des données (RGPD) à tous
          nos utilisateurs, où qu&apos;ils se trouvent, ainsi que les lois de protection des données
          applicables dans leur pays.
        </p>

        <h2>1. Responsable du traitement</h2>
        <p>
          La société éditrice désignée dans les{" "}
          <Link href="/mentions-legales">mentions légales</Link>. Contact pour toute question sur
          vos données : {mail}.
        </p>
        <p>
          Pour les documents que vous faites signer à des tiers, vous êtes responsable du traitement
          de leurs données (nom, coordonnées) ; QuickSign agit alors pour votre compte.
        </p>

        <h2>2. Données traitées</h2>
        <ul>
          <li>
            <strong>Compte :</strong> nom, adresse e-mail, téléphone (facultatif), mot de passe
            (stocké sous forme hachée, jamais en clair), photo ou logo, informations sur votre
            structure, pays, langue, fuseau horaire et devise préférée.
          </li>
          <li>
            <strong>Documents et signatures :</strong> fichiers importés, images de vos signatures
            et cachets, versions signées, réglages de votre bloc professionnel.
          </li>
          <li>
            <strong>Preuve des signatures :</strong> pour chaque événement (envoi, ouverture,
            signature, refus) : date et heure, adresse IP, navigateur et appareil, identité déclarée
            et coordonnées des signataires, empreintes numériques des documents.
          </li>
          <li>
            <strong>Paiement :</strong> plan, montant, devise, date, référence de transaction et
            numéro de reçu. Les données de carte bancaire ou de compte Mobile Money sont saisies
            chez le prestataire de paiement et ne nous sont jamais transmises.
          </li>
          <li>
            <strong>Assistant IA :</strong> vos messages et, uniquement à votre demande explicite,
            le contenu du document concerné.
          </li>
          <li>
            <strong>Sécurité et fonctionnement :</strong> journaux techniques d&apos;erreur,
            compteurs anti-abus (adresses IP et e-mails y sont hachés, jamais stockés en clair).
          </li>
        </ul>
        <p>
          QuickSign n&apos;utilise aucun outil de mesure d&apos;audience, aucune publicité et ne
          vend aucune donnée.
        </p>

        <h2>3. Finalités et bases légales</h2>
        <ul>
          <li>
            <strong>Fournir le service</strong> (compte, signature, stockage, envoi aux signataires,
            assistant) : exécution du contrat.
          </li>
          <li>
            <strong>Constituer et conserver la preuve des signatures</strong> : exécution du contrat
            et intérêt légitime (vous, et les autres signataires, devez pouvoir prouver ce qui a été
            signé).
          </li>
          <li>
            <strong>Abonnement, facturation et comptabilité</strong> : exécution du contrat et
            obligations légales.
          </li>
          <li>
            <strong>Sécurité, prévention de la fraude et des abus</strong> : intérêt légitime.
          </li>
          <li>
            <strong>E-mails liés au compte</strong> (confirmation, rappels, reçus) : exécution du
            contrat. Vous pouvez désactiver les e-mails non indispensables dans vos paramètres.
          </li>
        </ul>

        <h2>4. Prestataires (sous-traitants)</h2>
        <table>
          <thead>
            <tr>
              <th>Prestataire</th>
              <th>Rôle</th>
              <th>Localisation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Base de données, authentification, stockage des fichiers</td>
              <td>Union européenne (Paris)</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>Hébergement de l&apos;application</td>
              <td>Traitement à Paris ; société aux États-Unis</td>
            </tr>
            <tr>
              <td>Fly.io</td>
              <td>Conversion des documents Word en PDF (fichier non conservé)</td>
              <td>Paris ; société aux États-Unis</td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>Envoi des e-mails</td>
              <td>États-Unis</td>
            </tr>
            <tr>
              <td>Anthropic</td>
              <td>Assistant IA (données non utilisées pour entraîner les modèles)</td>
              <td>États-Unis</td>
            </tr>
            <tr>
              <td>Notch Pay</td>
              <td>Paiement Mobile Money et par carte</td>
              <td>Cameroun ; opérateurs et réseaux de cartes</td>
            </tr>
            <tr>
              <td>Google</td>
              <td>Connexion avec un compte Google, si vous la choisissez</td>
              <td>États-Unis</td>
            </tr>
          </tbody>
        </table>
        <p>
          Lorsque des données sont transférées hors de votre pays ou de l&apos;Union européenne, ces
          transferts s&apos;appuient sur les garanties prévues par les contrats de nos prestataires
          (par exemple les clauses contractuelles types de la Commission européenne).
        </p>

        <h2>5. Durées de conservation</h2>
        <table>
          <thead>
            <tr>
              <th>Données</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Compte, documents, signatures, conversations avec l&apos;assistant</td>
              <td>Tant que le compte existe (y compris sans abonnement)</td>
            </tr>
            <tr>
              <td>Documents placés dans la corbeille</td>
              <td>30 jours, puis suppression définitive automatique</td>
            </tr>
            <tr>
              <td>Journal de preuve des signatures</td>
              <td>
                Conservé pour la preuve, y compris après la suppression d&apos;un compte (il sert
                aussi aux autres signataires), 10 ans au plus
              </td>
            </tr>
            <tr>
              <td>Registre des paiements (montant, date, numéro de reçu, référence)</td>
              <td>
                10 ans pour les obligations comptables ; détaché de votre compte s&apos;il est
                supprimé
              </td>
            </tr>
            <tr>
              <td>Journaux techniques d&apos;erreur</td>
              <td>90 jours</td>
            </tr>
            <tr>
              <td>Compteurs anti-abus</td>
              <td>2 jours</td>
            </tr>
            <tr>
              <td>Messages envoyés via le formulaire de contact</td>
              <td>1 an</td>
            </tr>
            <tr>
              <td>Historique des rappels de facturation</td>
              <td>2 ans</td>
            </tr>
          </tbody>
        </table>

        <h2>6. Suppression et export</h2>
        <p>
          Dans <strong>Paramètres → Zone sensible</strong>, vous pouvez à tout moment :
        </p>
        <ul>
          <li>
            <strong>exporter vos données</strong> (fichier JSON : profil, abonnement, paiements,
            documents, signatures, demandes, modèles, journal) ;
          </li>
          <li>
            <strong>supprimer votre compte</strong> : vos fichiers et vos données sont effacés
            immédiatement. Seuls le journal de preuve et le registre des paiements sont conservés,
            comme indiqué ci-dessus. Les sauvegardes techniques de l&apos;hébergeur sont effacées au
            fil de leur rotation.
          </li>
        </ul>

        <h2>7. Vos droits</h2>
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de
          limitation, d&apos;opposition et de portabilité, et du droit de retirer un consentement à
          tout moment. Écrivez-nous à {mail} ; nous répondons sous 30 jours. Vous pouvez aussi
          saisir l&apos;autorité de protection des données de votre pays (par exemple la CNIL en
          France).
        </p>

        <h2>8. Sécurité</h2>
        <p>
          Connexions chiffrées, fichiers privés cloisonnés par compte et accessibles uniquement par
          liens temporaires, double authentification, journal de preuve en ajout seul. Voir la page{" "}
          <Link href="/securite">Sécurité</Link>.
        </p>

        <h2>9. Cookies</h2>
        <p>
          Uniquement des cookies strictement nécessaires (session, langue). Détails dans la{" "}
          <Link href="/cookies">politique cookies</Link>.
        </p>

        <h2>10. Modifications</h2>
        <p>
          En cas de modification importante, nous vous prévenons par e-mail avant son entrée en
          vigueur. La date de mise à jour figure en haut de cette page.
        </p>
      </>
    ),
  },
  en: {
    title: "Privacy policy",
    description: "What data QuickSign processes, why, with whom, for how long, and your rights.",
    body: (
      <>
        <p>
          This policy explains which personal data QuickSign processes, for what purpose, with which
          providers, for how long, and how to exercise your rights. We apply the principles of the
          EU General Data Protection Regulation (GDPR) to all our users, wherever they are, as well
          as the data protection laws that apply in their country.
        </p>

        <h2>1. Data controller</h2>
        <p>
          The publishing company named in the <Link href="/mentions-legales">legal notice</Link>.
          Contact for any question about your data: {mail}.
        </p>
        <p>
          For documents you send to third parties for signature, you are the controller of their
          data (name, contact details); QuickSign then acts on your behalf.
        </p>

        <h2>2. Data we process</h2>
        <ul>
          <li>
            <strong>Account:</strong> name, email address, phone (optional), password (stored as a
            hash, never in plain text), photo or logo, organization details, country, language, time
            zone and preferred currency.
          </li>
          <li>
            <strong>Documents and signatures:</strong> imported files, images of your signatures and
            stamps, signed versions, professional block settings.
          </li>
          <li>
            <strong>Proof of signatures:</strong> for each event (sending, opening, signing,
            declining): date and time, IP address, browser and device, signers&apos; declared
            identity and contact details, digital fingerprints of the documents.
          </li>
          <li>
            <strong>Payment:</strong> plan, amount, currency, date, transaction reference and
            receipt number. Card or Mobile Money details are entered with the payment provider and
            are never sent to us.
          </li>
          <li>
            <strong>AI assistant:</strong> your messages and, only at your explicit request, the
            content of the document concerned.
          </li>
          <li>
            <strong>Security and operation:</strong> technical error logs, anti-abuse counters (IP
            addresses and emails are hashed, never stored in plain text).
          </li>
        </ul>
        <p>QuickSign uses no audience measurement, no advertising, and never sells data.</p>

        <h2>3. Purposes and legal bases</h2>
        <ul>
          <li>
            <strong>Providing the service</strong> (account, signing, storage, sending to signers,
            assistant): performance of the contract.
          </li>
          <li>
            <strong>Creating and keeping proof of signatures</strong>: performance of the contract
            and legitimate interest (you, and the other signers, must be able to prove what was
            signed).
          </li>
          <li>
            <strong>Subscription, billing and accounting</strong>: performance of the contract and
            legal obligations.
          </li>
          <li>
            <strong>Security, fraud and abuse prevention</strong>: legitimate interest.
          </li>
          <li>
            <strong>Account emails</strong> (confirmation, reminders, receipts): performance of the
            contract. You can turn off non-essential emails in your settings.
          </li>
        </ul>

        <h2>4. Service providers (processors)</h2>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Role</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Database, authentication, file storage</td>
              <td>European Union (Paris)</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>Application hosting</td>
              <td>Processing in Paris; US company</td>
            </tr>
            <tr>
              <td>Fly.io</td>
              <td>Word to PDF conversion (file not kept)</td>
              <td>Paris; US company</td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>Sending emails</td>
              <td>United States</td>
            </tr>
            <tr>
              <td>Anthropic</td>
              <td>AI assistant (data not used to train models)</td>
              <td>United States</td>
            </tr>
            <tr>
              <td>Notch Pay</td>
              <td>Mobile Money and card payments</td>
              <td>Cameroon; operators and card networks</td>
            </tr>
            <tr>
              <td>Google</td>
              <td>Sign-in with a Google account, if you choose it</td>
              <td>United States</td>
            </tr>
          </tbody>
        </table>
        <p>
          When data is transferred outside your country or the European Union, these transfers rely
          on the safeguards provided in our providers&apos; contracts (for example the European
          Commission&apos;s standard contractual clauses).
        </p>

        <h2>5. Retention periods</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Period</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account, documents, signatures, assistant conversations</td>
              <td>As long as the account exists (including without a subscription)</td>
            </tr>
            <tr>
              <td>Documents in the trash</td>
              <td>30 days, then automatic permanent deletion</td>
            </tr>
            <tr>
              <td>Signature proof log</td>
              <td>
                Kept as evidence, including after an account is deleted (other signers rely on it
                too), 10 years at most
              </td>
            </tr>
            <tr>
              <td>Payment register (amount, date, receipt number, reference)</td>
              <td>10 years for accounting obligations; detached from your account if deleted</td>
            </tr>
            <tr>
              <td>Technical error logs</td>
              <td>90 days</td>
            </tr>
            <tr>
              <td>Anti-abuse counters</td>
              <td>2 days</td>
            </tr>
            <tr>
              <td>Messages sent through the contact form</td>
              <td>1 year</td>
            </tr>
            <tr>
              <td>Billing reminder history</td>
              <td>2 years</td>
            </tr>
          </tbody>
        </table>

        <h2>6. Deletion and export</h2>
        <p>
          In <strong>Settings → Danger zone</strong>, you can at any time:
        </p>
        <ul>
          <li>
            <strong>export your data</strong> (JSON file: profile, subscription, payments,
            documents, signatures, requests, templates, log);
          </li>
          <li>
            <strong>delete your account</strong>: your files and data are erased immediately. Only
            the proof log and the payment register are kept, as described above. The hosting
            provider&apos;s technical backups are erased as they rotate.
          </li>
        </ul>

        <h2>7. Your rights</h2>
        <p>
          You have the right to access, rectify, erase, restrict, object and to data portability,
          and the right to withdraw consent at any time. Write to us at {mail}; we reply within 30
          days. You may also lodge a complaint with the data protection authority of your country.
        </p>

        <h2>8. Security</h2>
        <p>
          Encrypted connections, private files isolated per account and only reachable through
          temporary links, two-factor authentication, append-only proof log. See the{" "}
          <Link href="/securite">Security</Link> page.
        </p>

        <h2>9. Cookies</h2>
        <p>
          Only strictly necessary cookies (session, language). Details in the{" "}
          <Link href="/cookies">cookie policy</Link>.
        </p>

        <h2>10. Changes</h2>
        <p>
          If we make a significant change, we will notify you by email before it takes effect. The
          last update date is shown at the top of this page.
        </p>
      </>
    ),
  },
};
