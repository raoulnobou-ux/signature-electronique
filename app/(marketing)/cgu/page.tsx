import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation et de vente",
  description: "Les conditions d'utilisation du service QuickSign et de ses abonnements.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Conditions générales d'utilisation et de vente" updatedAt="28 septembre 2026">
      <p>
        Les présentes conditions générales (les « Conditions ») régissent l&apos;utilisation du
        service QuickSign (le « Service »), édité par la société désignée dans les{" "}
        <Link href="/mentions-legales">mentions légales</Link> (« QuickSign », « nous »). En créant
        un compte, vous acceptez ces Conditions.
      </p>

      <h2>1. Le Service</h2>
      <p>
        QuickSign est un service en ligne permettant d&apos;importer des documents, d&apos;y apposer
        une signature électronique simple et, le cas échéant, un cachet, d&apos;obtenir un PDF signé
        horodaté, et, selon le plan, de faire signer des documents par des tiers et d&apos;utiliser
        un assistant d&apos;intelligence artificielle.
      </p>

      <h2>2. Compte</h2>
      <p>
        Vous devez fournir des informations exactes (nom, adresse e-mail, numéro de téléphone) et
        les tenir à jour. Vous êtes responsable de la confidentialité de vos identifiants et de
        toute action effectuée depuis votre compte. La vérification de votre adresse e-mail est
        requise avant toute signature.
      </p>

      <h2>3. Accès gratuit</h2>
      <p>
        L&apos;inscription est gratuite et ne demande aucun moyen de paiement. L&apos;accès gratuit
        permet de découvrir le service : tableau de bord, profil, import d&apos;un document,
        préparation de sa signature dans l&apos;éditeur et quelques questions à l&apos;assistant. La
        signature finale, l&apos;export du document signé et les fonctions avancées demandent la
        souscription d&apos;un plan. À la fin d&apos;un abonnement, le compte repasse en accès
        gratuit : vous conservez l&apos;accès à vos documents et pouvez les télécharger. Aucune
        donnée n&apos;est supprimée du fait de la fin d&apos;un abonnement.
      </p>

      <h2>4. Plans, prix et paiement</h2>
      <p>
        Les plans (Essentiel, Pro), leurs fonctionnalités, limites et prix sont présentés sur la
        page <Link href="/tarifs">Tarifs</Link>. Les prix sont indiqués en francs CFA (XAF), en
        euros (EUR), en dollars américains (USD) ou en livres sterling (GBP), toutes taxes
        applicables précisées au moment du paiement. Le paiement s&apos;effectue par Mobile Money ou
        carte bancaire via notre prestataire de paiement ; QuickSign n&apos;a jamais accès à vos
        données de carte.
      </p>
      <ul>
        <li>
          <strong>Renouvellement.</strong> Lorsque le moyen de paiement le permet, l&apos;abonnement
          est renouvelé automatiquement. À défaut (notamment Mobile Money), vous recevez des rappels
          avant l&apos;échéance avec un lien de paiement.
        </li>
        <li>
          <strong>Période de grâce.</strong> En l&apos;absence de paiement à l&apos;échéance,
          l&apos;accès est maintenu 3 jours, puis le compte passe en lecture seule.
        </li>
        <li>
          <strong>Changement de plan.</strong> Le passage de l&apos;Essentiel au Pro est immédiat,
          au prorata de la période restante. Le passage du Pro à l&apos;Essentiel prend effet à la
          fin de la période payée.
        </li>
        <li>
          <strong>Annulation.</strong> Vous pouvez annuler à tout moment ; l&apos;abonnement reste
          actif jusqu&apos;à la fin de la période payée et n&apos;est pas renouvelé. Les sommes
          versées pour une période entamée ne sont pas remboursées, sauf disposition légale
          contraire.
        </li>
      </ul>

      <h2>5. Valeur des signatures</h2>
      <p>
        QuickSign fournit une signature électronique simple dont la valeur de preuve repose sur la
        traçabilité (horodatage, empreinte, journal d&apos;audit, certificat). QuickSign n&apos;est
        pas un prestataire de signature qualifiée. Il vous appartient de vérifier que ce type de
        signature convient au document concerné. Voir la page{" "}
        <Link href="/securite#validite-juridique">Validité juridique</Link>.
      </p>

      <h2>6. Vos contenus</h2>
      <p>
        Vous restez propriétaire des documents que vous importez. Vous nous accordez uniquement les
        droits nécessaires pour les stocker, les convertir, les afficher, y apposer les signatures
        demandées et les transmettre aux destinataires que vous désignez. Vous garantissez disposer
        des droits nécessaires sur ces documents et ne pas utiliser le Service à des fins illicites
        (faux, usurpation d&apos;identité, fraude).
      </p>

      <h2>7. Assistant IA</h2>
      <p>
        L&apos;assistant fournit une aide à l&apos;utilisation et à la lecture des documents. Ses
        réponses peuvent comporter des erreurs et ne constituent en aucun cas un conseil juridique.
        Le contenu d&apos;un document n&apos;est transmis à l&apos;assistant qu&apos;à votre demande
        explicite.
      </p>

      <h2>8. Disponibilité et responsabilité</h2>
      <p>
        Nous mettons en œuvre les moyens raisonnables pour assurer la disponibilité et la sécurité
        du Service, sans garantie d&apos;absence d&apos;interruption. Dans les limites permises par
        la loi, notre responsabilité est limitée aux montants payés au cours des douze derniers
        mois.
      </p>

      <h2>9. Résiliation et données</h2>
      <p>
        Vous pouvez supprimer votre compte à tout moment depuis vos paramètres, après avoir exporté
        vos données si vous le souhaitez. Nous pouvons suspendre un compte en cas de violation grave
        des présentes Conditions.
      </p>

      <h2>10. Modification des Conditions</h2>
      <p>
        Nous pouvons faire évoluer ces Conditions. Toute modification importante vous sera notifiée
        par e-mail au moins 15 jours avant son entrée en vigueur.
      </p>

      <h2>11. Droit applicable</h2>
      <p>
        Les présentes Conditions sont régies par le droit camerounais et les textes OHADA
        applicables. À défaut de résolution amiable, tout litige relève des juridictions compétentes
        de [ville du siège — à compléter].
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question : <Link href="/contact">formulaire de contact</Link>.
      </p>
    </LegalPage>
  );
}
