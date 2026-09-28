# QuickSign

> Signez, faites signer, terminé. En 30 secondes.

QuickSign est une application web (SaaS) de signature électronique pensée pour les entreprises, cabinets, écoles et administrations du Cameroun et d'Afrique francophone : import Word/PDF, signature et cachet en quelques gestes, PDF signé horodaté, paiement Mobile Money, envoi par WhatsApp, assistant IA.

- Cahier des charges : [`SPEC.md`](SPEC.md)
- Décisions d'architecture : [`DECISIONS.md`](DECISIONS.md)

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS v4 + composants façon shadcn/ui (Radix UI) · Motion (Framer Motion) · Supabase (Postgres, Auth, Storage, RLS) · pdf.js / pdf-lib · Gotenberg (Word → PDF) · Claude (Anthropic) · Resend · Flutterwave · next-intl · TanStack Query · Vitest + Playwright.

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
messages/             traductions (fr.json ; en.json en Phase 9)
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

## Authentification

- Inscription en deux étapes (compte, puis profil facultatif), connexion par e-mail ou Google, mot de passe oublié.
- **Confirmation de l'e-mail obligatoire** avant la première connexion. Les liens des e-mails utilisent `token_hash` et la route `/auth/confirm` : ils fonctionnent même s'ils sont ouverts dans un autre navigateur ou sur un autre appareil que celui de l'inscription.
- Modèles d'e-mails de marque : `supabase/templates/*.html` (appliqués automatiquement en local). **En production**, copier leur contenu dans Supabase → Authentication → Email Templates, et configurer un SMTP (Resend) dans Authentication → SMTP Settings.
- URL à déclarer dans Supabase → Authentication → URL Configuration : _Site URL_ = l'URL de l'application ; _Redirect URLs_ = `https://<domaine>/**`.
- Google : créer un identifiant OAuth (Google Cloud Console), l'activer dans Supabase, puis `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.
- Les appels d'authentification passent par des Server Actions (validation zod, limitation de débit par IP et par compte). Supabase voyant l'IP du serveur, relever en production ses propres limites (Authentication → Rate Limits) : nos limites applicatives prennent le relais.

## Tests

- `npm test` : tests unitaires (droits, dates d'essai, validations, détection de type de fichier, génération du PDF signé) **et** tests d'intégration de la base (RLS, triggers) si Supabase local tourne.
- `npm run test:e2e` : parcours complets dans Chromium (bureau et mobile), dont inscription → e-mail de confirmation (lu dans Mailpit) → essai de 6 jours. Nécessite Supabase local et un build (`npm run build`).

## Déploiement

La procédure complète (Supabase, Gotenberg, Vercel, domaine, Resend, Flutterwave, Sentry, tâches planifiées) est détaillée dans la section 13 de `SPEC.md` et sera finalisée en Phase 10. En résumé :

1. Créer deux projets Supabase (préproduction et production), puis `supabase link --project-ref <ref>` et `supabase db push`.
2. Déployer Gotenberg (image `gotenberg/gotenberg:8`) sur Railway, Render ou Fly.io, protégé par un jeton.
3. Importer le dépôt dans Vercel, renseigner les variables de `.env.example`.
4. Configurer l'URL du site et les URL de redirection dans Supabase → Authentication → URL Configuration.

## Validité juridique

QuickSign propose une **signature électronique simple** dont la valeur de preuve repose sur la traçabilité (horodatage, empreinte SHA-256, journal d'audit, certificat). Ce n'est pas une signature qualifiée. Voir la page « Sécurité et validité juridique » de l'application.
