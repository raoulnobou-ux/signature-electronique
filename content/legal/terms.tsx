import Link from "next/link";
import { siteConfig } from "@/lib/site";
import type { LegalDoc } from "./types";

const mail = <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>;

/**
 * Conditions générales d'utilisation et de vente. Elles décrivent le fonctionnement réel :
 * accès gratuit, abonnements prépayés sans prélèvement automatique, grâce de 3 jours,
 * paiement via Notch Pay, signature électronique simple.
 */
export const termsDoc: LegalDoc = {
  fr: {
    title: "Conditions générales d'utilisation et de vente",
    description: "Les conditions d'utilisation du service QuickSign et de ses abonnements.",
    body: (
      <>
        <p>
          Les présentes conditions générales (les « Conditions ») régissent l&apos;utilisation du
          service QuickSign (le « Service »), édité par la société désignée dans les{" "}
          <Link href="/mentions-legales">mentions légales</Link> (« QuickSign », « nous »). En
          créant un compte, vous acceptez ces Conditions et la{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>

        <h2>1. Le Service</h2>
        <p>
          QuickSign permet d&apos;importer des documents, d&apos;y apposer une signature
          électronique simple et, le cas échéant, un cachet, d&apos;obtenir un PDF signé horodaté
          et, selon le plan, de faire signer des documents par des tiers et d&apos;utiliser un
          assistant d&apos;intelligence artificielle.
        </p>

        <h2>2. Compte</h2>
        <p>
          Vous devez fournir des informations exactes et les tenir à jour. Vous êtes responsable de
          la confidentialité de vos identifiants et de toute action effectuée depuis votre compte.
          La vérification de votre adresse e-mail est requise. Le Service est réservé aux personnes
          ayant la capacité de contracter.
        </p>

        <h2>3. Accès gratuit</h2>
        <p>
          L&apos;inscription est gratuite et sans moyen de paiement. L&apos;accès gratuit permet de
          découvrir le Service dans les limites indiquées sur la page{" "}
          <Link href="/tarifs">Tarifs</Link> (notamment un document et une signature). La signature
          finale, l&apos;export du document signé et les fonctions avancées demandent un abonnement.
        </p>

        <h2>4. Abonnements, prix et paiement</h2>
        <ul>
          <li>
            <strong>Prix.</strong> Les plans, leurs limites et leurs prix sont présentés sur la page{" "}
            <Link href="/tarifs">Tarifs</Link>. Les prix sont fixés pour chaque devise proposée
            (franc CFA, euro, dollar américain, livre sterling), sans conversion automatique. Les
            taxes éventuelles sont calculées et affichées au moment du paiement. Pour le moment, le
            paiement s&apos;effectue en franc CFA ; d&apos;autres devises et moyens de paiement
            seront ajoutés progressivement.
          </li>
          <li>
            <strong>Paiement.</strong> Il est traité par Notch Pay, notre prestataire de paiement,
            sur sa page sécurisée : Mobile Money (MTN, Orange) ou carte bancaire. QuickSign n&apos;a
            jamais accès à vos données de carte ni à votre code Mobile Money, et vous remet un reçu
            pour chaque paiement.
          </li>
          <li>
            <strong>Durée.</strong> L&apos;abonnement est payé d&apos;avance pour un mois ou un an.
            Il n&apos;y a pas de prélèvement automatique : vous recevez des rappels avant
            l&apos;échéance pour le renouveler. Un renouvellement anticipé s&apos;ajoute à la fin de
            la période en cours.
          </li>
          <li>
            <strong>Échéance.</strong> Sans renouvellement, l&apos;accès complet est maintenu 3
            jours, puis le compte repasse en accès gratuit. Vos documents restent consultables et
            téléchargeables.
          </li>
          <li>
            <strong>Changement de plan.</strong> Le passage de l&apos;Essentiel au Pro est immédiat,
            au prorata de la période restante. Le passage du Pro à l&apos;Essentiel prend effet à la
            fin de la période payée.
          </li>
          <li>
            <strong>Remboursements.</strong> Une période commencée n&apos;est pas remboursée, sauf
            erreur de notre part ou disposition légale contraire. Pour une demande, écrivez-nous à{" "}
            {mail}.
          </li>
          <li>
            <strong>Consommateurs.</strong> Si vous agissez en tant que consommateur, les droits
            impératifs que vous accorde la loi de votre pays de résidence (par exemple le droit de
            rétractation dans l&apos;Union européenne, dans ses conditions) s&apos;appliquent en
            plus des présentes Conditions.
          </li>
        </ul>

        <h2>5. Valeur des signatures</h2>
        <p>
          QuickSign fournit une <strong>signature électronique simple</strong>, dont la valeur de
          preuve repose sur la traçabilité (identité déclarée, horodatage, empreintes, journal de
          preuve, certificat). Dans de nombreux pays, une signature ne peut être privée d&apos;effet
          juridique au seul motif qu&apos;elle est électronique (par exemple le règlement européen
          eIDAS, la loi camerounaise n° 2010/012 et l&apos;Acte uniforme OHADA, ou la loi américaine
          ESIGN). QuickSign n&apos;est <strong>pas</strong> un prestataire de signature qualifiée ou
          avancée au sens de ces textes. Il vous appartient de vérifier que ce type de signature
          convient au document concerné. Voir{" "}
          <Link href="/securite#validite-juridique">Validité juridique</Link>.
        </p>

        <h2>6. Vos contenus et usages interdits</h2>
        <p>
          Vous restez propriétaire des documents que vous importez. Vous nous accordez seulement les
          droits nécessaires pour les stocker, les convertir, les afficher, y apposer les signatures
          demandées et les transmettre aux destinataires que vous désignez. Vous garantissez
          disposer des droits nécessaires sur ces documents et vous vous interdisez tout usage
          illicite : faux, usurpation d&apos;identité, fraude, contenus illégaux, envoi de messages
          non sollicités, contournement des limites du Service.
        </p>

        <h2>7. Assistant IA</h2>
        <p>
          L&apos;assistant aide à utiliser le Service et à lire des documents. Ses réponses peuvent
          comporter des erreurs et ne constituent jamais un conseil juridique. Le contenu d&apos;un
          document ne lui est transmis qu&apos;à votre demande explicite.
        </p>

        <h2>8. Disponibilité et responsabilité</h2>
        <p>
          Nous mettons en œuvre les moyens raisonnables pour assurer la disponibilité et la sécurité
          du Service, sans garantie d&apos;absence d&apos;interruption. Dans les limites permises
          par la loi, notre responsabilité est limitée aux sommes payées au cours des douze derniers
          mois ; aucune limitation ne s&apos;applique en cas de faute lourde ou intentionnelle.
        </p>

        <h2>9. Résiliation et données</h2>
        <p>
          Vous pouvez exporter vos données et supprimer votre compte à tout moment depuis vos
          paramètres. Nous pouvons suspendre un compte en cas de violation grave des Conditions,
          après vous en avoir informé sauf urgence (fraude, sécurité).
        </p>

        <h2>10. Modification des Conditions</h2>
        <p>
          Toute modification importante vous est notifiée par e-mail au moins 15 jours avant son
          entrée en vigueur. Si vous la refusez, vous pouvez supprimer votre compte avant cette
          date.
        </p>

        <h2>11. Droit applicable</h2>
        <p>
          Les présentes Conditions sont régies par le droit camerounais et les textes OHADA
          applicables, sans priver un consommateur de la protection des règles impératives de son
          pays de résidence. Nous privilégions toujours une solution amiable : écrivez-nous à {mail}
          . À défaut, les tribunaux compétents sont ceux du siège de l&apos;éditeur, sauf règle
          impérative contraire.
        </p>
      </>
    ),
  },
  en: {
    title: "Terms of use and sale",
    description: "The terms of use of the QuickSign service and its subscriptions.",
    body: (
      <>
        <p>
          These terms (the &quot;Terms&quot;) govern the use of the QuickSign service (the
          &quot;Service&quot;), published by the company named in the{" "}
          <Link href="/mentions-legales">legal notice</Link> (&quot;QuickSign&quot;,
          &quot;we&quot;). By creating an account, you accept these Terms and the{" "}
          <Link href="/confidentialite">privacy policy</Link>.
        </p>

        <h2>1. The Service</h2>
        <p>
          QuickSign lets you import documents, apply a simple electronic signature and, where
          relevant, a stamp, obtain a signed, timestamped PDF and, depending on the plan, have
          documents signed by third parties and use an artificial intelligence assistant.
        </p>

        <h2>2. Account</h2>
        <p>
          You must provide accurate information and keep it up to date. You are responsible for
          keeping your credentials confidential and for any action taken from your account. Email
          verification is required. The Service is reserved for people who have the legal capacity
          to enter into a contract.
        </p>

        <h2>3. Free access</h2>
        <p>
          Sign-up is free and requires no payment method. Free access lets you discover the Service
          within the limits shown on the <Link href="/tarifs">Pricing</Link> page (in particular one
          document and one signature). Final signing, export of the signed document and advanced
          features require a subscription.
        </p>

        <h2>4. Subscriptions, prices and payment</h2>
        <ul>
          <li>
            <strong>Prices.</strong> Plans, their limits and prices are shown on the{" "}
            <Link href="/tarifs">Pricing</Link> page. Prices are set for each currency offered (CFA
            franc, euro, US dollar, pound sterling), with no automatic conversion. Any taxes are
            calculated and shown at checkout. For now, payment is made in CFA francs; more
            currencies and payment methods will be added over time.
          </li>
          <li>
            <strong>Payment.</strong> It is processed by Notch Pay, our payment provider, on its
            secure page: Mobile Money (MTN, Orange) or card. QuickSign never has access to your card
            details or Mobile Money PIN, and gives you a receipt for every payment.
          </li>
          <li>
            <strong>Term.</strong> A subscription is paid in advance for one month or one year.
            There is no automatic debit: you receive reminders before the due date to renew it. An
            early renewal is added to the end of the current period.
          </li>
          <li>
            <strong>Due date.</strong> Without renewal, full access is kept for 3 days, then the
            account returns to free access. Your documents remain viewable and downloadable.
          </li>
          <li>
            <strong>Plan changes.</strong> Upgrading from Essential to Pro is immediate, prorated
            for the remaining period. Moving from Pro to Essential takes effect at the end of the
            paid period.
          </li>
          <li>
            <strong>Refunds.</strong> A started period is not refunded, except in case of error on
            our part or where the law provides otherwise. For any request, write to {mail}.
          </li>
          <li>
            <strong>Consumers.</strong> If you act as a consumer, the mandatory rights granted by
            the law of your country of residence (for example the right of withdrawal in the
            European Union, under its conditions) apply in addition to these Terms.
          </li>
        </ul>

        <h2>5. Legal value of signatures</h2>
        <p>
          QuickSign provides a <strong>simple electronic signature</strong>, whose evidential value
          relies on traceability (declared identity, timestamps, fingerprints, proof log,
          certificate). In many countries, a signature cannot be denied legal effect solely because
          it is electronic (for example the EU eIDAS regulation, Cameroonian law No. 2010/012 and
          the OHADA Uniform Act, or the US ESIGN Act). QuickSign is <strong>not</strong> a provider
          of qualified or advanced signatures within the meaning of these texts. It is up to you to
          check that this type of signature suits the document concerned. See{" "}
          <Link href="/securite#validite-juridique">Legal validity</Link>.
        </p>

        <h2>6. Your content and prohibited uses</h2>
        <p>
          You remain the owner of the documents you import. You only grant us the rights needed to
          store, convert, display them, apply the requested signatures and send them to the
          recipients you choose. You guarantee that you hold the necessary rights to these documents
          and you will not use the Service unlawfully: forgery, identity theft, fraud, illegal
          content, unsolicited messages, circumventing the Service&apos;s limits.
        </p>

        <h2>7. AI assistant</h2>
        <p>
          The assistant helps you use the Service and read documents. Its answers may contain errors
          and never constitute legal advice. A document&apos;s content is only sent to it at your
          explicit request.
        </p>

        <h2>8. Availability and liability</h2>
        <p>
          We use reasonable means to ensure the Service&apos;s availability and security, without
          guaranteeing it will be uninterrupted. To the extent permitted by law, our liability is
          limited to the amounts paid in the last twelve months; no limitation applies in case of
          gross negligence or wilful misconduct.
        </p>

        <h2>9. Termination and data</h2>
        <p>
          You can export your data and delete your account at any time from your settings. We may
          suspend an account in case of a serious breach of the Terms, after informing you except in
          an emergency (fraud, security).
        </p>

        <h2>10. Changes to the Terms</h2>
        <p>
          Any significant change is notified to you by email at least 15 days before it takes
          effect. If you do not accept it, you can delete your account before that date.
        </p>

        <h2>11. Governing law</h2>
        <p>
          These Terms are governed by Cameroonian law and the applicable OHADA texts, without
          depriving a consumer of the protection of the mandatory rules of their country of
          residence. We always seek an amicable solution first: write to {mail}. Failing that, the
          competent courts are those of the publisher&apos;s registered office, unless mandatory
          rules provide otherwise.
        </p>
      </>
    ),
  },
};
