# Décisions d'architecture — QuickSign

Journal des choix techniques pris là où le cahier des charges (`SPEC.md`) est silencieux ou demande un arbitrage. Chaque entrée : la décision, puis la raison.

## Architecture générale

**D1 — Le dépôt est l'application.** La racine du dépôt contient directement l'app Next.js (pas de sous-dossier `quicksign/`). Le prototype HTML statique de départ a été retiré ; il reste dans l'historique Git.
_Raison :_ Vercel, la CI et les outils fonctionnent sans configuration de sous-dossier.

**D2 — Next.js 16 (App Router, Turbopack).** Conventions de la v16 : `proxy.ts` (remplace `middleware.ts`), `params`/`cookies()`/`headers()` asynchrones.
_Raison :_ version stable actuelle, imposée par la stack.

**D3 — Rendu serveur par défaut, client seulement quand il le faut.** Les pages publiques sont des Server Components statiques ; l'interactivité (éditeur, formulaires, animations) est isolée dans des composants `"use client"`.
_Raison :_ pages légères, rapides sur réseau mobile lent (objectif Lighthouse ≥ 90).

**D4 — Logique métier dans `lib/`, sans dépendance à React.** `lib/entitlements`, `lib/pdf`, `lib/payments`, `lib/billing` sont des modules TypeScript purs, testés avec Vitest.
_Raison :_ la logique critique (droits, dates d'essai, PDF, webhooks) doit être testable isolément.

## Interface et design

**D5 — Tailwind CSS v4 + composants « à la shadcn » dans `components/ui`.** Mêmes briques que shadcn/ui (Radix UI via le paquet `radix-ui`, `class-variance-authority`, `tailwind-merge`), code possédé par le projet et adapté à la DA.
_Raison :_ c'est le principe de shadcn/ui (on copie les composants, on ne dépend pas d'une librairie). Le registre en ligne du CLI shadcn n'est pas joignable depuis l'environnement de développement ; les composants sont donc écrits à la main dans le même format.

**D6 — Animations avec `motion`.** C'est le nouveau nom de Framer Motion (`import { motion } from "motion/react"`). Toutes les animations respectent `prefers-reduced-motion` (`MotionConfig reducedMotion="user"` + CSS).

**D7 — Polices auto-hébergées.** Space Grotesk (titres) et Inter (texte) via `@fontsource-variable` + `next/font/local`, `display: swap`. Les 6 polices manuscrites sont chargées à la demande (uniquement dans l'éditeur de signature).
_Raison :_ aucune dépendance à Google Fonts au build ni à l'exécution, meilleur temps de chargement.

**D8 — Thème : `next-themes`, sombre par défaut.** Attribut `class` sur `<html>`, tokens de couleur en variables CSS (`app/globals.css`), mode clair complet.

**D9 — Icônes : `lucide-react`.** Notifications : `sonner` (toasts). Palette de commandes : `cmdk`.

## Internationalisation

**D10 — `next-intl` sans préfixe de langue dans l'URL.** La langue vient, dans l'ordre : du profil de l'utilisateur, du cookie `NEXT_LOCALE`, de l'en-tête `Accept-Language` ; défaut `fr`. Messages dans `messages/fr.json` (et `en.json` en Phase 9).
_Raison :_ URLs simples (`/tarifs`, pas `/fr/tarifs`) pour un public majoritairement francophone ; la bascule anglaise reste possible sans changer les routes.

## Données, authentification

**D11 — Supabase avec `@supabase/ssr`.** Session en cookies, rafraîchie par `proxy.ts`. Trois clients : navigateur (clé anon), serveur (clé anon + cookies de l'utilisateur, soumis à la RLS), admin (clé service, réservé aux webhooks/crons, jamais importé côté client — protégé par `server-only`).

**D12 — Développement local avec Supabase CLI + Docker.** `npx supabase start` lance Postgres, Auth, Storage, Realtime et un serveur mail de test (Mailpit). Les migrations SQL versionnées dans `supabase/migrations/` sont la source de vérité du schéma.

**D13 — Confirmation de l'e-mail obligatoire à la connexion.** Supabase n'autorise pas la connexion d'un compte non confirmé si la confirmation est activée ; plutôt que de réimplémenter une vérification maison, on exige la confirmation avant la première connexion (l'e-mail de confirmation fait aussi office de bienvenue). Avec Google, l'e-mail est déjà vérifié.
_Raison :_ plus simple et plus sûr ; couvre « vérification obligatoire avant de signer ».

**D14 — L'essai démarre en base, pas dans le code applicatif.** Un trigger Postgres sur `auth.users` crée le profil et un abonnement `trial` / `trialing` avec `current_period_end = now() + 6 jours`.
_Raison :_ impossible d'avoir un utilisateur sans abonnement, quel que soit le mode d'inscription (e-mail ou Google).

**D15 — `getEntitlements` est une fonction pure.** Elle reçoit l'abonnement, la configuration des plans, les compteurs d'usage et l'heure courante, et renvoie plan effectif, fonctionnalités, quotas restants, jours d'essai restants. Les accès serveur passent par `requireEntitlement()` qui charge ces données puis appelle la fonction pure.
_Raison :_ testable sans base de données, horloge injectable pour tester les dates d'essai.

**D16 — Prix et limites dans `plans_config`.** Les montants (XAF et USD) et les quotas sont lus en base ; le code contient des valeurs par défaut identiques en repli.

## Tests et qualité

**D17 — Vitest (logique) + Playwright (parcours).** Playwright est épinglé sur la version dont le navigateur Chromium est installé dans l'environnement.

**D18 — CI GitHub Actions** : lint, vérification de types, tests unitaires, build, à chaque push et pull request.

## Pages publiques (Phase 2)

**D19 — Landing sans JavaScript superflu.** Animations en CSS pur (signature qui s'écrit, cachet, apparition au défilement via `animation-timeline: view()` en amélioration progressive), FAQ en `<details>` natifs, halos d'ambiance en dégradés radiaux plutôt qu'en filtres `blur`, flou d'arrière-plan réservé aux écrans ≥ 768 px. Le fournisseur racine ne charge que le thème ; données, animations Motion, toasts et infobulles sont chargés par l'application connectée (`AppShellProviders`).
_Mesure (Lighthouse mobile, build de production) :_ performance 94, accessibilité 100, SEO 100 ; bureau 100.

**D20 — Traductions transmises au navigateur par espace de noms.** `ClientMessages` n'envoie au client que `common`, `validation` et les espaces demandés (ex. `landing.pricing`).

**D21 — Devise affichée.** FCFA par défaut pour la zone CEMAC (pays détecté par l'en-tête `x-vercel-ip-country`) ou, à défaut, pour un navigateur en français ; USD sinon. Bascule manuelle toujours disponible. Les prix viennent de `plans_config` (cache 5 min), avec repli sur les valeurs par défaut.

**D22 — Aucun faux témoignage.** La section Témoignages est prête mais masquée tant que `content/testimonials.ts` est vide.

**D23 — Limitation de débit en base.** Fonction Postgres `check_rate_limit` (fenêtre glissante, verrou consultatif), clés hachées ; fonctionne sur plusieurs instances serverless sans service externe (Redis). En cas de panne de la base, on laisse passer plutôt que de bloquer un utilisateur légitime.

**D24 — Formulaire de contact.** Validation zod partagée client/serveur, champ piège anti-robots, 5 messages/heure/IP, enregistrement dans `contact_messages` puis notification e-mail au support (si Resend est configuré).

**D25 — E-mails via l'API HTTP de Resend** (pas de SDK) avec un gabarit maison en tableaux et styles en ligne (`lib/email/layout.ts`). Sans clé, l'e-mail est journalisé, jamais perdu silencieusement en production puisque la clé y est obligatoire.

**D26 — Textes juridiques provisoires.** CGU, confidentialité et mentions légales sont rédigées et marquées « version provisoire » ; les champs d'identification de la société sont à compléter et l'ensemble doit être relu par un juriste local avant l'ouverture publique (cf. SPEC §12).

**D27 — Corbeille par date, pas par statut.** `documents.trashed_at` plutôt qu'un statut « jeté » : un document restauré retrouve son statut d'origine (brouillon, signé…).

## Authentification et comptes (Phase 3)

**D28 — L'étape « Profil » est envoyée avec l'inscription.** Comme la connexion exige un e-mail confirmé (D13), il n'y a pas encore de session à l'étape 2 : type de compte, structure, secteur et ville sont transmis dans les métadonnées de `signUp` et recopiés par le trigger. La photo/le logo se règlent ensuite dans les paramètres.

**D29 — Liens d'e-mail en `token_hash` plutôt qu'en PKCE.** Un lien de confirmation ouvert dans l'application Gmail ou sur un autre appareil fonctionne quand même (`verifyOtp` côté serveur, route `/auth/confirm`). Le PKCE n'est utilisé que pour Google (même navigateur).

**D30 — E-mail de bienvenue envoyé à la confirmation**, une seule fois (marquage atomique `welcome_email_sent_at`), aussi pour Google.

**D31 — Limites de débit adaptées au partage d'IP.** Au Cameroun, de nombreux utilisateurs partagent une adresse IP (NAT des opérateurs mobiles, cybercafés, bureaux) : limites par IP larges (ex. 120 connexions / 10 min), limites par compte strictes (10 tentatives / 10 min, 3 e-mails de réinitialisation / heure).

**D32 — Téléphone normalisé en E.164** (`libphonenumber-js`, métadonnées « min »), Cameroun +237 par défaut ; la liste complète des pays n'est rendue que côté navigateur (les noms localisés diffèrent entre Node et les navigateurs). Changer de numéro remet `phone_verified_at` à zéro.

**D33 — Robustesse du mot de passe calculée localement** (règle : 8 caractères, lettres et chiffres ; jauge 0–4, mots courants pénalisés). Pas de zxcvbn (trop lourd pour mobile).

**D34 — Droits chargés une fois par requête** (`getCurrentAccount`, mis en cache React) : profil, abonnement, limites (`plans_config`) et usage (`my_usage_snapshot`, une seule requête SQL). `guard(feature, quota)` protège chaque action serveur ; la RLS (`can_write`) bloque en plus toute écriture d'un compte expiré.

**D35 — Onboarding en deux temps.** La page `/app/bienvenue` accueille par le prénom et présente les 4 étapes ; les étapes interactives (signature, cachet, import, signature du document) s'appuient sur l'éditeur livré en Phase 5.

**D36 — Photos de profil dans un bucket public** (`avatars`), noms aléatoires non devinables, type vérifié par les octets, 2 Mo max. Les documents et signatures, eux, restent dans des buckets privés.

**D37 — Suppression de compte immédiate** après confirmation écrite (« SUPPRIMER ») : fichiers purgés de tous les buckets puis utilisateur supprimé (cascade SQL). Export complet en JSON disponible avant.
