import Link from "next/link";
import type { LegalDoc } from "./types";

/**
 * Politique cookies : inventaire réel (cookies de session Supabase, cookie de langue,
 * stockage local du thème et d'un brouillon de demande). Aucun cookie de mesure ni de
 * publicité : aucun bandeau de consentement n'est donc nécessaire. À revoir si un outil
 * de mesure d'audience est ajouté un jour (consentement préalable obligatoire).
 */
export const cookiesDoc: LegalDoc = {
  fr: {
    title: "Politique cookies",
    description: "Les cookies et le stockage local utilisés par QuickSign, et pourquoi.",
    body: (
      <>
        <p>
          QuickSign n&apos;utilise que des cookies et éléments de stockage{" "}
          <strong>strictement nécessaires</strong> au fonctionnement du service. Aucun cookie de
          mesure d&apos;audience, de publicité ou de réseau social n&apos;est déposé. Ces éléments
          étant indispensables, ils ne nécessitent pas votre consentement préalable ; aucun bandeau
          ne vous est donc imposé.
        </p>

        <h2>Cookies</h2>
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>sb-…-auth-token</code>
              </td>
              <td>Maintien de votre session après la connexion (sécurisé, propre au site)</td>
              <td>Jusqu&apos;à la déconnexion ou l&apos;expiration de la session</td>
            </tr>
            <tr>
              <td>
                <code>NEXT_LOCALE</code>
              </td>
              <td>Langue choisie (français ou anglais)</td>
              <td>1 an</td>
            </tr>
          </tbody>
        </table>

        <h2>Stockage local du navigateur</h2>
        <table>
          <thead>
            <tr>
              <th>Clé</th>
              <th>Rôle</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>theme</code>
              </td>
              <td>Thème clair ou sombre</td>
              <td>Jusqu&apos;à ce que vous effaciez les données du site</td>
            </tr>
            <tr>
              <td>Brouillon de demande</td>
              <td>Demande de signature préparée par l&apos;assistant, le temps de la reprendre</td>
              <td>Fermeture de l&apos;onglet</td>
            </tr>
            <tr>
              <td>Cache hors ligne</td>
              <td>
                Application installable : pages et ressources publiques pour un démarrage rapide
              </td>
              <td>Jusqu&apos;à la mise à jour suivante</td>
            </tr>
          </tbody>
        </table>

        <h2>Paiement</h2>
        <p>
          La page de paiement de Notch Pay s&apos;ouvre sur son propre site. Elle peut y déposer ses
          propres cookies, nécessaires au paiement et à la prévention de la fraude ; ils sont régis
          par la politique de Notch Pay.
        </p>

        <h2>Vos choix</h2>
        <p>
          Vous pouvez supprimer les cookies et données du site dans les réglages de votre navigateur
          ; vous serez alors simplement déconnecté. Pour toute question, voir la{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </>
    ),
  },
  en: {
    title: "Cookie policy",
    description: "The cookies and local storage used by QuickSign, and why.",
    body: (
      <>
        <p>
          QuickSign only uses cookies and storage that are <strong>strictly necessary</strong> for
          the service to work. No analytics, advertising or social media cookies are set. Because
          these items are essential, they do not require your prior consent, so no banner is forced
          on you.
        </p>

        <h2>Cookies</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>sb-…-auth-token</code>
              </td>
              <td>Keeps you signed in (secure, first-party)</td>
              <td>Until you sign out or the session expires</td>
            </tr>
            <tr>
              <td>
                <code>NEXT_LOCALE</code>
              </td>
              <td>Chosen language (French or English)</td>
              <td>1 year</td>
            </tr>
          </tbody>
        </table>

        <h2>Browser local storage</h2>
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>theme</code>
              </td>
              <td>Light or dark theme</td>
              <td>Until you clear the site&apos;s data</td>
            </tr>
            <tr>
              <td>Request draft</td>
              <td>Signature request prepared by the assistant, until you pick it up</td>
              <td>When the tab is closed</td>
            </tr>
            <tr>
              <td>Offline cache</td>
              <td>Installable app: public pages and assets for a fast start</td>
              <td>Until the next update</td>
            </tr>
          </tbody>
        </table>

        <h2>Payment</h2>
        <p>
          Notch Pay&apos;s payment page opens on its own website. It may set its own cookies there,
          required for payment and fraud prevention; they are governed by Notch Pay&apos;s policy.
        </p>

        <h2>Your choices</h2>
        <p>
          You can delete the site&apos;s cookies and data in your browser settings; you will simply
          be signed out. For any question, see the{" "}
          <Link href="/confidentialite">privacy policy</Link>.
        </p>
      </>
    ),
  },
};
