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

# 3. Conversion Word → PDF (facultatif en local)
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

## Déploiement

La procédure complète (Supabase, Gotenberg, Vercel, domaine, Resend, Flutterwave, Sentry, tâches planifiées) est détaillée dans la section 13 de `SPEC.md` et sera finalisée en Phase 10. En résumé :

1. Créer deux projets Supabase (préproduction et production), puis `supabase link --project-ref <ref>` et `supabase db push`.
2. Déployer Gotenberg (image `gotenberg/gotenberg:8`) sur Railway, Render ou Fly.io, protégé par un jeton.
3. Importer le dépôt dans Vercel, renseigner les variables de `.env.example`.
4. Configurer l'URL du site et les URL de redirection dans Supabase → Authentication → URL Configuration.

## Validité juridique

QuickSign propose une **signature électronique simple** dont la valeur de preuve repose sur la traçabilité (horodatage, empreinte SHA-256, journal d'audit, certificat). Ce n'est pas une signature qualifiée. Voir la page « Sécurité et validité juridique » de l'application.
