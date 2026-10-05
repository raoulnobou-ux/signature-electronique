# QuickSign

> Signez, faites signer, terminé. En 30 secondes.

QuickSign est une application web (SaaS) de signature électronique pensée pour les entreprises, cabinets, écoles et administrations, partout dans le monde : import Word/PDF, signature et cachet en quelques gestes, PDF signé horodaté, paiement par carte ou Mobile Money, envoi par WhatsApp, assistant IA.

- Cahier des charges : [`SPEC.md`](SPEC.md)
- Décisions d'architecture : [`DECISIONS.md`](DECISIONS.md)

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS v4 + composants façon shadcn/ui (Radix UI) · Motion (Framer Motion) · Supabase (Postgres, Auth, Storage, RLS) · pdf.js / pdf-lib · Gotenberg (Word → PDF) · Claude (Anthropic) · Resend · CinetPay · next-intl · TanStack Query · Vitest + Playwright.

## Prérequis

- Node.js ≥ 20.9 (22 recommandé)
- Docker (pour Supabase en local et Gotenberg)

## Installation locale

```bash
npm install

# 1. Base de données, authentification et stockage (Docker)
npm run db:start          # affiche l'URL et les clés locales

# 2. Variables d'environnement
cp .env.example .env.local
# → reporter NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY affichées par db:start

# 3. Conversion Word → PDF (Gotenberg, protégé par GOTENBERG_TOKEN)
docker compose up -d gotenberg

# 4. Lancer l'application
npm run dev               # http://localhost:3000
```

Les e-mails envoyés en local (confirmation d'inscription, réinitialisation…) sont visibles dans Mailpit : http://127.0.0.1:54324.

## Commandes

| Commande                          | Rôle                                                              |
| --------------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                     | Serveur de développement                                          |
| `npm run build` / `npm start`     | Build et serveur de production                                    |
| `npm run lint`                    | ESLint                                                            |
| `npm run format` / `format:check` | Prettier                                                          |
| `npm run typecheck`               | Génère les types de routes puis vérifie TypeScript                |
| `npm test`                        | Tests unitaires (Vitest)                                          |
| `npm run test:e2e`                | Parcours de bout en bout (Playwright, sur le build de production) |
| `npm run check`                   | Lint + types + tests                                              |
| `npm run db:start` / `db:stop`    | Démarre / arrête Supabase local                                   |
| `npm run db:reset`                | Recrée la base locale et rejoue toutes les migrations             |
| `npm run db:types`                | Régénère `lib/supabase/database.types.ts` depuis le schéma        |

## Variables d'environnement

Toutes les variables sont décrites dans [`.env.example`](.env.example). Seules les variables `NEXT_PUBLIC_*` sont exposées au navigateur ; les autres restent côté serveur (`lib/env.server.ts`, protégé par `server-only`). Les intégrations externes (IA, paiement, e-mail, conversion Word) sont facultatives en développement : sans clé, la fonctionnalité concernée affiche un message explicite.

## Structure

```
app/                  routes Next.js (pages publiques, authentification, application, API)
components/ui/        design system (boutons, cartes, modales, tiroir, onglets, palette…)
components/brand/     logo, fond d'ambiance
lib/                  logique métier : supabase, entitlements, pdf, paiements, ia
messages/             traductions (fr.json, en.json)
supabase/migrations/  schéma SQL versionné (tables, RLS, stockage, triggers)
tests/unit/           Vitest — tests/e2e/ : Playwright
```

Le design system est visible sur `/design`.

## Base de données

Le schéma complet (tables, Row Level Security, buckets privés, trigger de création du profil et de l'essai de 6 jours) est dans `supabase/migrations/`. Principes :

- chaque table a la RLS activée : un utilisateur ne voit que ses données (ou celles de son équipe) ;
- abonnements, paiements, journal d'audit et compteurs d'usage ne sont écrits que par le serveur ;
- le journal d'audit est en ajout seul (toute modification est refusée par un trigger) ;
- les fichiers sont dans des buckets privés, servis par URL signées temporaires.

## Documents

- Formats : PDF, Word (.doc, .docx, .odt, .rtf), photos (JPEG, PNG, WebP). 25 Mo maximum (`NEXT_PUBLIC_MAX_UPLOAD_MB`).
- Import : glisser-déposer, sélection de fichiers, scanner (appareil photo, détection et redressement de la feuille), lien public (Google Drive, Dropbox, OneDrive).
- Stockage privé `documents/<utilisateur>/<document>/` : original, PDF de travail, vignette, versions signées.
- Gotenberg en production : image `gotenberg/gotenberg:8` lancée avec `--api-enable-basic-auth`, variables `GOTENBERG_API_BASIC_AUTH_USERNAME=quicksign` et `GOTENBERG_API_BASIC_AUTH_PASSWORD=<GOTENBERG_TOKEN>`.
- Tâche planifiée quotidienne : `/api/cron/purge-trash` (corbeille > 30 jours), déclarée dans `vercel.json`.

## Signature

- Bibliothèque `/app/signatures` : signatures et paraphes dessinés (lissage, épaisseur, couleur), tapés (6 écritures manuscrites libres OFL) ou importés en photo (fond retiré). PNG + SVG stockés dans le bucket privé `signatures`.
- Éditeur `/app/documents/<id>/signer` : placement au toucher, déplacement, redimensionnement, rotation, opacité, guides d'alignement, annuler/rétablir (Ctrl+Z / Ctrl+Y), brouillon enregistré automatiquement (`placed_fields`).
- Finalisation côté serveur (pdf-lib) : nouvelle version `v<n>.pdf`, SHA-256 avant/après, événement d'audit `document.signed`, compteur mensuel. L'original et les versions précédentes ne sont jamais modifiés.

## Fonctionnalités Pro

- **Cachets** : générateur (rond, ovale, rectangle, texte circulaire, effet encre) ou import d'image.
- **Demandes de signature** `/app/documents/<id>/demande` : signataires (e-mail et/ou WhatsApp), ordre ou simultané, zones par signataire, date limite. Lien personnel `/s/<jeton>` : signature au doigt, sans compte, refus motivé. Suivi `/app/demandes/<id>` (relances, lien WhatsApp, annulation, journal CSV).
- **Certificat et vérification** : certificat PDF avec QR code ; `/verify/<id>` et `/verify` comparent l'empreinte d'un fichier sans l'envoyer.
- **Modèles** `/app/modeles` : rôles, zones, champs variables ; création d'un document et d'une demande en un clic.
- **Signature en lot** : sélection de 2 à 20 documents dans la liste → un placement → archive ZIP.
- **Équipe** `/app/equipe` : 5 places, rôles, invitations par e-mail (`/invitation/<jeton>`), cachets et modèles partagés, journal d'activité ; les membres bénéficient du plan Pro du propriétaire.
- Tâche planifiée quotidienne `/api/cron/requests` (expiration, relances automatiques). Variable `LINK_SECRET` (secret des liens de signature).

## Assistant IA (QuickSign Copilot)

- Bulle en bas à droite, page `/app/assistant`, palette Ctrl/Cmd + K (« Demander à l'assistant »), bouton « Analyser avec l'assistant » sur un document (Pro).
- Modèle Claude `claude-opus-5-5` (SDK `@anthropic-ai/sdk`) : renseigner `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys). Le repli automatique en cas de refus du filtre de sécurité (`fallbacks: "default"`) est activé.
- Essentiel : questions d'usage et visites guidées, 20 messages/jour. Pro : analyse de documents (résumé, points clés, points d'attention, zones de signature, traduction), rédaction, préparation de demandes, relances — toujours confirmées par l'utilisateur.
- Sans clé, `AI_MOCK=true` active un assistant simulé (développement, tests e2e) ; jamais en production.

## Abonnements et paiements

- **Accès gratuit avant paiement** : un document, l'éditeur en découverte, une signature, l'assistant (5 messages par jour). Signer et exporter demandent un abonnement. Limites dans `plans_config` (ligne `free`) ; détails dans [`docs/PAIEMENTS.md`](docs/PAIEMENTS.md#accès-avant-paiement).
- Page `/app/abonnement` : plan actuel, usage, choix du plan (mensuel ou annuel ; FCFA, euro, dollar ou livre), récapitulatif exact (prorata), historique et reçus PDF.
- Plusieurs prestataires derrière une même interface (`lib/billing/providers/`), activés par `PAYMENT_PROVIDERS`. Guide complet : [`docs/PAIEMENTS.md`](docs/PAIEMENTS.md).
  - **Carte bancaire → Paddle** (EUR, USD, GBP ; carte, PayPal, Apple Pay, Google Pay ; Paddle est revendeur officiel et gère la TVA) :
    - variables `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET` ;
    - lien de paiement par défaut : `https://<domaine>/app/abonnement/paiement` ;
    - notifications : `https://<domaine>/api/webhooks/paddle`.
  - **Mobile Money → pawaPay** (FCFA, zone franc CFA ; MTN, Orange… sur la page de paiement hébergée de pawaPay) :
    - variable `PAWAPAY_API_TOKEN` (et `PAWAPAY_ENV=sandbox` pour les essais) ;
    - callback de dépôt : `https://<domaine>/api/webhooks/pawapay`.
- Les moyens de paiement proposés dépendent du pays du visiteur. Les prix sont fixés par marché dans `plans_config`, sans conversion automatique.
- Le retour client arrive sur `/api/billing/return` ; aucun plan n'est activé sans revérification de la transaction par l'API du prestataire.
- Sans prestataire, `PAYMENTS_SANDBOX=true` active un paiement simulé (développement, tests e2e) ; jamais en production.
- Tâche planifiée quotidienne : `/api/cron/billing` (rappels J-5/J-2/J, fin des anciens essais, grâce de 3 jours, retour à l'accès gratuit), déclarée dans `vercel.json`.
- Les prix se modifient dans la table `plans_config` sans redéployer.

## Authentification

- Inscription en deux étapes (compte, puis profil facultatif), connexion par e-mail ou Google, mot de passe oublié.
- **Confirmation de l'e-mail obligatoire** avant la première connexion. Les liens des e-mails utilisent `token_hash` et la route `/auth/confirm` : ils fonctionnent même s'ils sont ouverts dans un autre navigateur ou sur un autre appareil que celui de l'inscription.
- Modèles d'e-mails de marque : `supabase/templates/*.html` (appliqués automatiquement en local). **En production**, copier leur contenu dans Supabase → Authentication → Email Templates, et configurer un SMTP (Resend) dans Authentication → SMTP Settings.
- URL à déclarer dans Supabase → Authentication → URL Configuration : _Site URL_ = l'URL de l'application ; _Redirect URLs_ = `https://<domaine>/**`.
- Google : créer un identifiant OAuth (Google Cloud Console), l'activer dans Supabase, puis `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.
- Les appels d'authentification passent par des Server Actions (validation zod, limitation de débit par IP et par compte). Supabase voyant l'IP du serveur, relever en production ses propres limites (Authentication → Rate Limits) : nos limites applicatives prennent le relais.

## Langues, sécurité, application installable

- **Français et anglais** : `messages/fr.json` et `messages/en.json` (mêmes clés, vérifié par les tests). Sélecteur dans le pied de page, les pages de connexion et Paramètres → Profil. En production, copier aussi les modèles bilingues `supabase/templates/confirmation.html` et `recovery.html` dans Supabase → Authentication → Email Templates.
- **Double authentification** (application Google Authenticator, Authy…) : Paramètres → Sécurité. Activer « TOTP » dans Supabase → Authentication → Multi-Factor (actif par défaut sur Supabase hébergé).
- **CSP stricte** avec nonce par requête (`proxy.ts`, `lib/security/csp.ts`), en-têtes HSTS, X-Frame-Options, etc.
- **PWA** : `app/manifest.ts`, `public/sw.js` (aucune donnée privée en cache), page `/hors-ligne`.

## Tests

- `npm test` : tests unitaires (droits, dates d'essai, validations, détection de type de fichier, génération du PDF signé, outils et boucle de l'assistant) **et** tests d'intégration de la base (RLS, triggers) si Supabase local tourne.
- `npm run test:e2e` : parcours complets dans Chromium (bureau et mobile), dont inscription → e-mail de confirmation (lu dans Mailpit) → essai de 6 jours. Nécessite Supabase local et un build (`npm run build`).

## Déploiement

Le guide complet, étape par étape, est dans [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) : Supabase (production et préproduction), Gotenberg (`deploy/gotenberg/`, Fly.io ou Render), Vercel (variables, tâches planifiées, région Paris), domaine et Resend (SPF/DKIM/DMARC), CinetPay, Sentry, test final.

- `npm run deploy:check -- .env.production` : vérifie les variables de production (secrets, modes de test désactivés, HTTPS).
- `npm run smoke -- https://<domaine>` : test rapide d'un déploiement (pages, en-têtes de sécurité, santé, webhooks, PWA).
- `GET /api/health` : état de la base et de la conversion Word (détail de la configuration avec `Authorization: Bearer <CRON_SECRET>`).

## Validité juridique

QuickSign propose une **signature électronique simple** dont la valeur de preuve repose sur la traçabilité (horodatage, empreinte SHA-256, journal d'audit, certificat). Ce n'est pas une signature qualifiée. Voir la page « Sécurité et validité juridique » de l'application.
