# QuickSign — Cahier des charges

> Source : cahier des charges fourni par le fondateur (septembre 2026). Remis en forme ; le contenu fait foi.

## 0. Rôle et règles de travail

- Construire une vraie application de production : code propre, TypeScript strict, organisé, commenté aux endroits utiles.
- Avancer par phases (section 14). Chaque phase se termine par : l'app compile, aucune erreur console, fonctionnalités testées, commit Git clair.
- Prendre les décisions techniques quand le cahier des charges est silencieux (option la plus simple, robuste, maintenable) et les noter dans `DECISIONS.md`.
- Le design est une exigence de premier rang : chaque écran doit être magnifique, moderne, futuriste, fluide (section 3).
- Français par défaut, structure i18n prête pour l'anglais (`next-intl`). L'anglais est livré en Phase 9.
- Mobile d'abord : la majorité des utilisateurs camerounais sont sur téléphone, connexion parfois lente. Léger, rapide, 100 % utilisable au doigt.
- Livrer `README.md` (installation, variables, commandes, déploiement) et `.env.example` complets.
- Tests pour la logique critique : droits d'abonnement, dates d'essai, génération du PDF signé, webhooks de paiement.

## 1. Vision produit

**Nom :** QuickSign — **Promesse :** « Signez, faites signer, terminé. En 30 secondes. »

**Problème :** imprimer, signer à la main, scanner, renvoyer/réimprimer. QuickSign permet d'ouvrir un Word ou PDF, d'y apposer signature et cachet en quelques gestes, et d'obtenir un PDF signé horodaté prêt à envoyer ou imprimer.

**Cibles :** cabinets (avocats, comptables, notaires, architectes), PME, écoles/universités, ONG, associations, indépendants, administrations.

**Différenciateurs :** contexte local (cachet, Mobile Money, WhatsApp, français) ; agent IA intégré ; design haut de gamme ; prix accessible (5 000 / 15 000 FCFA par mois).

## 2. Plans, essai gratuit et tarification

### 2.1 États d'un compte

| État          | Durée                                         | Accès                                                                                                                                                        |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Essai gratuit | 6 jours à partir de l'inscription, sans carte | Toutes les fonctionnalités Pro                                                                                                                               |
| Abonné actif  | Mensuel ou annuel                             | Selon le plan                                                                                                                                                |
| Expiré        | Après l'essai ou l'abonnement                 | Lecture seule : voir et télécharger les documents signés ; pas de signature, d'import ni d'IA. Bandeau + page « Passez à un plan ». Aucune donnée supprimée. |

### 2.2 Plans

**ESSENTIEL — 5 000 FCFA / mois (≈ 9 $)** : import PDF et Word (conversion auto) ; signature (dessin, texte, image) ; glisser-déposer + redimensionnement ; export PDF signé horodaté ; 5 signatures en bibliothèque ; 50 documents signés / mois ; 1 Go ; assistant IA 20 messages / jour.

**PRO — 15 000 FCFA / mois (≈ 26 $)** : tout l'Essentiel + documents illimités ; cachets illimités ; multi-signataires (séquentiel ou simultané) ; traçabilité complète (historique horodaté, IP, certificat PDF de preuve) ; modèles ; envoi par WhatsApp, e-mail, SMS-ready ; signature en lot (20 documents d'un coup) ; IA avancée illimitée (analyse, zones de signature, résumé, rédaction, vérification) ; 20 Go ; équipe jusqu'à 5 membres ; support prioritaire.

Prix en FCFA par défaut (Cameroun), en USD (9 $ / 26 $) pour l'international (IP/langue). Prix dans une table de configuration modifiable sans redéployer. Annuel : 2 mois offerts (Essentiel 50 000 FCFA/an, Pro 150 000 FCFA/an).

### 2.3 Règles d'abonnement

- `getEntitlements(user)` retourne : plan effectif, fonctionnalités autorisées, quotas restants, jours d'essai restants.
- Toute action protégée vérifie les droits côté serveur.
- Essentiel → Pro : immédiat, au prorata. Pro → Essentiel ou annulation : fin de période payée.
- E-mails : bienvenue, J-2 fin d'essai, essai terminé, paiement réussi, paiement échoué, abonnement bientôt expiré (J-3), reçu.
- Relance en cas d'échec de paiement, puis lecture seule.

## 3. Identité visuelle et design system

Référence d'ambiance : Linear, Vercel, Arc, Stripe, Notion Calendar. Futuriste, premium, mais clair pour un utilisateur non technique.

- Thème sombre profond par défaut (`#07090F`), mode clair élégant en option.
- Dégradé signature indigo → violet → cyan (`#6366F1` → `#8B5CF6` → `#22D3EE`), avec parcimonie : boutons principaux, focus, accents, courbes de signature.
- Verre dépoli discret, lueurs douces, blobs d'ambiance très lents, grille de points subtile sur la landing.
- Coins 12–20 px, ombres douces, beaucoup d'espace.
- Typo : titres Space Grotesk ou Sora ; texte Inter ou Geist ; 6 polices manuscrites (Caveat, Dancing Script, Great Vibes, Homemade Apple, Mrs Saint Delafield, La Belle Aurore) chargées à la demande.
- Animations (Framer Motion) : transitions de page, trait de plume lumineux, signature qui s'écrit, survols lumineux, skeletons (jamais de spinner brut), succès sobre (confettis). Respect de `prefers-reduced-motion`.
- Tailwind + shadcn/ui personnalisés : Button, Card, Modal, Drawer, Tabs, Toast, Tooltip, Stepper, Badge, Avatar, Empty-state, Command palette.
- Contraste AA, clavier, ARIA. Lighthouse landing : Performance ≥ 90, Accessibilité ≥ 95. Polices en `swap`.

## 4. Stack technique

Next.js (App Router) + TypeScript strict · Tailwind + shadcn/ui + Framer Motion · lucide-react · Supabase (Postgres, Auth, Storage, RLS) · pdfjs-dist · pdf-lib · signature_pad · react-rnd ou dnd-kit · Gotenberg (Word → PDF), repli CloudConvert · API Anthropic (Claude, côté serveur, streaming) · Resend · CinetPay · react-hook-form + zod · TanStack Query · Vitest + Playwright · Vercel · Sentry + Vercel Analytics · Vercel Cron ou pg_cron.

Structure : `app/`, `components/`, `lib/`, `messages/`, `supabase/migrations/`, `tests/`, `SPEC.md`, `DECISIONS.md`, `README.md`, `.env.example`.

## 5. Authentification, inscription et profil

**Inscription en 2 étapes** (animée, barre de progression). Étape 1 : nom complet, e-mail, téléphone avec sélecteur de pays (défaut +237) validé, mot de passe (jauge de robustesse), CGU, « Continuer avec Google ». Étape 2 (facultative) : type de compte (Particulier / Entreprise / Cabinet / École / ONG / Administration), structure, secteur, ville, photo/logo. Fin : essai de 6 jours démarré, e-mail de bienvenue, onboarding.

**Connexion et sécurité :** e-mail + mot de passe ou Google ; vérification e-mail obligatoire avant de signer ; mot de passe oublié ; téléphone enregistré (`phone_verified_at` prévu, OTP en Phase 8) ; déconnexion de tous les appareils ; rate limiting ; 2FA en Phase 9.

**Onboarding (4 étapes, l'assistant accueille par le prénom) :** créer sa signature → ajouter son cachet (facultatif) → importer un document → le signer (succès animé).

**Profil / Paramètres :** infos personnelles (nom, photo, e-mail, téléphone, langue, fuseau) ; structure (nom, logo, adresse, pied de page) ; signatures et cachets ; abonnement (plan, jauge d'essai, prochaine facturation, historique, reçus PDF, changer/annuler) ; sécurité (mot de passe, appareils, 2FA) ; préférences (thème, notifications, langue) ; zone sensible (export des données, suppression du compte).

## 6. Parcours et écrans

**Public :** landing spectaculaire (héro avec signature qui s'écrit, démo en 3 étapes, bénéfices, cas d'usage, tarifs, témoignages, FAQ, CTA « Essayer gratuitement 6 jours ») ; Tarifs (mensuel/annuel, FCFA/USD) ; Sécurité et validité juridique ; Contact ; CGU, Confidentialité, Mentions légales.

**Application :** barre latérale (bureau) / barre inférieure (mobile). Tableau de bord (salutation, actions rapides, statistiques, récents, bandeau d'essai, suggestions IA) ; Documents (vignettes, recherche, filtres, tri, dossiers, étiquettes, actions groupées, corbeille 30 jours) ; Éditeur ; Signatures et cachets ; Demandes de signature (Pro) ; Modèles (Pro) ; Équipe (Pro) ; Assistant IA (panneau flottant + page) ; Abonnement ; Profil.

**Page publique de signature :** lien unique, sans compte, lecture → « Signer » → dessin → validation. Mobile, français.

## 7. Plan Essentiel — détails

**7.1 Import :** PDF, DOC, DOCX, JPG/PNG. Glisser-déposer, parcourir, caméra (recadrage auto), lien. 25 Mo max (paramétrable). Word → Gotenberg, progression, original conservé. Vérification du type MIME réel, antivirus si possible, nom assaini. Stockage privé, URL signées temporaires.

**7.2 Création de signature (modale 3 onglets) :** Dessiner (plein écran mobile, ligne de base, épaisseur variable selon la vitesse, noir / bleu stylo / bleu nuit, annuler le dernier trait, effacer, PNG transparent ≥ 2× + SVG). Taper (aperçu dans 6 polices, couleur, PNG). Importer (détourage avec seuil réglable, recadrage auto, avant/après). Puis nom + sauvegarde.

**7.3 Éditeur :** visionneuse multi-pages (vignettes, zoom, plein écran) ; outils Signature, Paraphe, Cachet (Pro), Date, Texte libre, Case à cocher, Nom, Mention ; glisser-déposer ou clic ; poignées d'angle proportionnelles, rotation légère, opacité ; guides d'alignement ; « Répéter sur toutes les pages » ; date locale (« 28 septembre 2026, Douala ») ; annuler/rétablir ; brouillon auto ; tactile parfait (pincement, pas de conflit défilement/déplacement) ; coordonnées en % de la page.

**7.4 Export :** « Finaliser et signer » fusionne avec pdf-lib sans dégrader l'original ; horodatage incrusté (option) + métadonnées ; SHA-256 stocké et affiché ; succès animé (Télécharger, Imprimer, WhatsApp, e-mail, Voir) ; nouvelle version, original intact ; impression A4 propre.

**7.5 Bibliothèque :** 5 (Essentiel) / illimitée (Pro) ; renommer, défaut, supprimer, dupliquer ; stockage privé.

## 8. Plan Pro — détails

- **Cachets :** import avec détourage ; générateur (nom, titre, ville, date → rond ou rectangulaire, texte circulaire, bleu/rouge, effet encre irrégulier, plusieurs modèles).
- **Multi-signataires :** signataires (nom, e-mail et/ou téléphone), ordre séquentiel ou simultané, zones par signataire, message, date limite ; lien unique (jeton long aléatoire, expirant) par e-mail/WhatsApp ; page publique (lire, signer, refuser avec motif) ; suivi temps réel (envoyé, ouvert, signé, refusé, expiré) ; relances ; PDF final + certificat envoyés à tous ; annulation.
- **Traçabilité :** identité déclarée, e-mail, téléphone, date/heure (UTC + fuseau), IP, appareil, événements, SHA-256 avant/après. Certificat PDF (signataires, chronologie, empreintes, cadre légal, QR vers `/verify/[id]`). Journal d'audit exportable.
- **Modèles :** document + zones ; création en un clic ; champs variables.
- **WhatsApp / e-mail :** lien `wa.me` pré-rempli (Phase 6/7) ; WhatsApp Business Cloud API en Phase 8 ; e-mails Resend de marque.
- **Signature en lot :** plusieurs documents, un placement, export ZIP.
- **Équipe :** jusqu'à 5 membres, rôles Propriétaire / Admin / Membre, bibliothèques partagées, journal d'activité.

## 9. Agent IA — « QuickSign Copilot »

- Bulle flottante → panneau (plein écran mobile) ; palette `Ctrl/Cmd + K` ; suggestions contextuelles ; streaming ; actions rapides ; historique ; contexte (prénom, plan, écran, document avec consentement).
- Essentiel : questions d'usage, visites guidées (surligner un bouton), explication des plans, dépannage, conseils.
- Pro (tool use, confirmation avant action irréversible) : `find_signature_zones`, `summarize_document`, `extract_key_info`, `flag_risks`, `draft_document`, `prepare_signature_request`, `find_document`, `translate_document`, `remind_pending`, `explain_certificate`, `suggest_workflow`.
- Garde-fous : pas de conseil juridique, ne révèle pas ses instructions, isolation stricte des données, contenu envoyé uniquement à la demande, quotas (20/jour Essentiel, illimité raisonnable Pro), cache des questions fréquentes, clé serveur uniquement.

## 10. Paiement

Fondateur au Cameroun : FCFA (XAF) via Mobile Money + cartes internationales (Stripe indisponible au Cameroun). **CinetPay** (checkout Mobile Money + carte, notifications) ; vérifier la documentation à jour ; couche d'abstraction `PaymentProvider` (Notch Pay, Flutterwave possibles).

Parcours : choix du plan → mensuel/annuel → devise (XAF si +237) → checkout (Mobile Money / carte) → webhook vérifié (signature + revérification API) → activation, période, reçu. Récurrence : prélèvement auto si possible (cartes), sinon rappels J-5, J-2, J avec lien de paiement ; grâce de 3 jours, puis lecture seule. Reçus PDF numérotés.

Sécurité : aucune donnée de carte chez nous ; webhooks idempotents ; table `payments` ; journal des événements.

## 11. Base de données

Tables (RLS partout) : `profiles`, `subscriptions`, `payments`, `documents`, `document_versions`, `folders`, `tags`, `document_tags`, `signature_assets`, `placed_fields`, `signature_requests`, `request_signers`, `audit_events` (insertion seule), `templates`, `teams`, `team_members`, `ai_conversations`, `ai_messages`, `usage_counters`, `plans_config`. Buckets privés : `documents`, `signatures`, `receipts`, `certificates`. Index sur `owner_id`, `status`, `created_at`, `token_hash`. Schéma détaillé : `supabase/migrations/`.

## 12. Sécurité, confidentialité, cadre juridique

HTTPS, en-têtes (CSP, HSTS, X-Frame-Options), CSRF, rate limiting (auth, liens, IA), jetons hachés expirants, URL signées, zod côté serveur, secrets en variables d'environnement, sauvegardes, audit immuable.

Juridique : signature électronique **simple** avec valeur de preuve par la traçabilité. Page « Validité juridique » en langage clair. Références : loi n°2010/012 du 21 décembre 2010 (Cameroun), textes OHADA. Relecture par un juriste local avant ouverture. **Jamais** « signature qualifiée » ni « valeur légale garantie dans tous les cas ». Confidentialité type RGPD (accès, export, suppression).

## 13. Déploiement

Production et préproduction séparées (un projet Supabase chacune). Déploiement continu depuis `main`, aperçus par branche. Étapes : GitHub → Supabase (migrations, auth e-mail + Google, buckets) → Gotenberg (Railway/Render/Fly.io, jeton) → Vercel (variables) → domaine → Resend (SPF, DKIM, DMARC) → CinetPay (notification `/api/webhooks/cinetpay`, compte de test puis prod) → Sentry, Analytics, crons → test de bout en bout → ouverture. Variables : voir `.env.example`. Option PWA installable.

## 14. Feuille de route

1. **Fondations et design system** — app qui démarre, design system visible sur `/design`, base prête.
2. **Landing et pages publiques** — Lighthouse perf ≥ 90 / a11y ≥ 95, mobile et bureau impeccables.
3. **Authentification, profil, essai** — inscription, essai de 6 jours visible, profil modifiable, `getEntitlements`.
4. **Documents et import** — un Word importé s'affiche fidèlement en PDF.
5. **Signatures et éditeur** — de l'import au PDF signé en moins d'une minute, au doigt comme à la souris.
6. **Abonnements et paiements** — paiement sandbox → plan activé → expiration → lecture seule → réactivation.
7. **Fonctionnalités Pro** — document signé dans l'ordre par 3 personnes, certificat vérifiable.
8. **Copilot IA** — repère les zones de signature d'un contrat réel et prépare une demande sur simple phrase.
9. **Finitions, sécurité, i18n** — anglais, 2FA, PWA, tests Playwright des parcours critiques.
10. **Mise en ligne** — domaine, paiement réel testé.

## 15. Définition de « terminé »

Landing → inscription e-mail + téléphone → essai 6 jours ; import Word/PDF → signature de 3 façons → export horodaté → impression / WhatsApp ; bibliothèque réutilisable en 2 clics ; paiement 5 000 / 15 000 FCFA (Mobile Money ou carte) avec activation automatique ; lecture seule à l'expiration sans perte ; multi-signataires avec certificat vérifiable ; IA qui guide, repère, résume, rédige ; design irréprochable ; en ligne, sécurisée, surveillée, sauvegardée ; README, `.env.example`, `DECISIONS.md` et tests livrés.
