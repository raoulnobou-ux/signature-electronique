import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Quelles données QuickSign collecte, pourquoi, et quels sont vos droits.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="28 septembre 2026">
      <p>
        Cette politique explique quelles données personnelles QuickSign traite, dans quel but, et
        comment exercer vos droits. Nous appliquons les bonnes pratiques du Règlement général sur la
        protection des données (RGPD) pour l&apos;ensemble de nos utilisateurs, ainsi que la
        réglementation camerounaise applicable.
      </p>

      <h2>1. Données collectées</h2>
      <ul>
        <li>
          <strong>Compte :</strong> nom, adresse e-mail, numéro de téléphone, mot de passe (stocké
          sous forme chiffrée irréversible), photo ou logo, informations sur votre structure.
        </li>
        <li>
          <strong>Documents et signatures :</strong> les fichiers que vous importez, les images de
          vos signatures et cachets, les versions signées.
        </li>
        <li>
          <strong>Traçabilité :</strong> pour chaque événement de signature, la date et
          l&apos;heure, l&apos;adresse IP, le navigateur et l&apos;appareil, l&apos;identité
          déclarée des signataires.
        </li>
        <li>
          <strong>Paiement :</strong> référence de transaction, montant, plan. Les données de carte
          ou de compte Mobile Money sont traitées exclusivement par notre prestataire de paiement.
        </li>
        <li>
          <strong>Assistant IA :</strong> les messages que vous lui adressez et, uniquement à votre
          demande, le contenu du document concerné.
        </li>
        <li>
          <strong>Utilisation :</strong> journaux techniques et mesures d&apos;audience anonymisées,
          pour assurer le bon fonctionnement et améliorer le Service.
        </li>
      </ul>

      <h2>2. Finalités</h2>
      <p>
        Fournir le Service (signature, stockage, envoi), gérer votre abonnement et la facturation,
        constituer les preuves de signature, assurer la sécurité (prévention de la fraude,
        limitation des abus), vous envoyer les e-mails liés à votre compte, et répondre à vos
        demandes.
      </p>

      <h2>3. Sous-traitants</h2>
      <p>Nous faisons appel à des prestataires sélectionnés pour leur niveau de sécurité :</p>
      <ul>
        <li>hébergement de l&apos;application et de la base de données, stockage des fichiers ;</li>
        <li>conversion des documents Word en PDF ;</li>
        <li>envoi des e-mails transactionnels ;</li>
        <li>paiement (Mobile Money et carte) ;</li>
        <li>
          assistant d&apos;intelligence artificielle (les données transmises ne servent pas à
          entraîner les modèles) ;
        </li>
        <li>surveillance des erreurs.</li>
      </ul>
      <p>
        Certains de ces prestataires peuvent être situés hors du Cameroun ; les transferts sont
        encadrés par des garanties contractuelles appropriées. La liste détaillée est disponible sur
        demande.
      </p>

      <h2>4. Durées de conservation</h2>
      <ul>
        <li>Documents, signatures et journaux d&apos;audit : tant que votre compte existe.</li>
        <li>Documents placés dans la corbeille : 30 jours, puis suppression définitive.</li>
        <li>Données de facturation : durée imposée par les obligations comptables et fiscales.</li>
        <li>
          Après suppression du compte : effacement sous 30 jours, sauf obligation légale de
          conservation.
        </li>
      </ul>

      <h2>5. Sécurité</h2>
      <p>
        Chiffrement des connexions et des fichiers au repos, stockage privé cloisonné par compte,
        liens temporaires, journal d&apos;audit en ajout seul, sauvegardes régulières. Voir la page{" "}
        <Link href="/securite">Sécurité</Link>.
      </p>

      <h2>6. Vos droits</h2>
      <p>
        Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de
        limitation, d&apos;opposition et de portabilité de vos données. Depuis vos paramètres, vous
        pouvez exporter l&apos;ensemble de vos données et supprimer votre compte. Pour toute autre
        demande, écrivez-nous via le <Link href="/contact">formulaire de contact</Link> ; nous
        répondons sous 30 jours.
      </p>

      <h2>7. Cookies</h2>
      <p>
        QuickSign n&apos;utilise que des cookies strictement nécessaires : maintien de votre
        session, préférences de langue et de thème. Aucun cookie publicitaire n&apos;est déposé.
      </p>

      <h2>8. Contact</h2>
      <p>
        Responsable du traitement : la société désignée dans les{" "}
        <Link href="/mentions-legales">mentions légales</Link>.
      </p>
    </LegalPage>
  );
}
