# Mise en ligne de QuickSign

Guide pas à pas, dans l'ordre. Comptez environ 2 heures la première fois. Chaque étape indique **où cliquer** et **quelle variable** renseigner. Les valeurs secrètes ne se collent **que** dans les tableaux de bord (Vercel, Supabase, Fly.io…), jamais dans un e-mail, un chat ou le dépôt Git.

> Région recommandée partout : **Europe de l'Ouest (Paris)**, la plus proche du Cameroun parmi les régions disponibles.

## 0. Secrets à générer une fois

Dans un terminal (ou https://generate-secret.vercel.app/48) :

```bash
openssl rand -base64 48   # → LINK_SECRET   (liens de signature ; ne plus jamais le changer)
openssl rand -base64 32   # → CRON_SECRET   (tâches planifiées)
openssl rand -base64 32   # → GOTENBERG_TOKEN (conversion Word)
```

## 1. Supabase — base de données, authentification, fichiers

> **Déjà fait (29 septembre 2026)** : projets `quicksign-prod` (réf. `xwefjsfietaidkxlydue`, https://xwefjsfietaidkxlydue.supabase.co) et `quicksign-preprod` (réf. `qxmghxqtlwilkstxpsln`, https://qxmghxqtlwilkstxpsln.supabase.co), région Paris, avec toutes les migrations (13) appliquées et vérifiées (schéma identique au local, conseils de sécurité Supabase traités). Il reste à faire les points 3 à 10 ci-dessous dans le tableau de bord.

1. https://supabase.com/dashboard → **New project** : `quicksign-prod`, région **West EU (Paris)**, mot de passe fort (à conserver). Créer aussi `quicksign-preprod` pour les essais.
2. Appliquer le schéma (toutes les migrations de `supabase/migrations/`) :
   ```bash
   npx supabase link --project-ref <ref-du-projet>
   npx supabase db push
   ```
3. **Project Settings → API** : noter `Project URL` (→ `NEXT_PUBLIC_SUPABASE_URL`), `anon public` (→ `NEXT_PUBLIC_SUPABASE_ANON_KEY`), `service_role` (→ `SUPABASE_SERVICE_ROLE_KEY`, secret).
4. **Authentication → URL Configuration** : _Site URL_ = `https://<votre-domaine>` ; _Redirect URLs_ = `https://<votre-domaine>/**`.
5. **Authentication → Email Templates** : copier le contenu de `supabase/templates/confirmation.html` (Confirm signup) et `recovery.html` (Reset password) ; objets : « Confirmez votre adresse e-mail · Confirm your email » et « Réinitialisation de votre mot de passe · Password reset ».
6. **Authentication → SMTP Settings** : activer le SMTP personnalisé avec Resend (étape 4) : hôte `smtp.resend.com`, port 465, utilisateur `resend`, mot de passe = clé API Resend.
7. **Authentication → Multi-Factor** : vérifier que **TOTP** est activé (double authentification).
8. **Authentication → Rate Limits** : relever les limites e-mail/connexion (l'application applique déjà les siennes).
9. (Facultatif) **Google** : Authentication → Providers → Google (identifiants OAuth Google Cloud), puis `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` dans Vercel.
10. **Database → Backups** : sauvegardes quotidiennes (incluses dans le plan Pro Supabase ; recommandé en production).

## 2. Gotenberg — conversion Word → PDF

Option recommandée : **Fly.io** (≈ 5 $/mois, 1 Go de RAM, région Paris).

```bash
cd deploy/gotenberg
fly launch --copy-config --no-deploy        # garde fly.toml (app « quicksign-gotenberg »)
fly secrets set GOTENBERG_API_BASIC_AUTH_PASSWORD=<GOTENBERG_TOKEN>
fly deploy
```

→ `GOTENBERG_URL=https://quicksign-gotenberg.fly.dev` et `GOTENBERG_TOKEN=<le même jeton>`.

Alternative : **Render** → New → Blueprint → ce dépôt (fichier `render.yaml`, plan Standard), puis renseigner `GOTENBERG_API_BASIC_AUTH_PASSWORD`.

Vérification : `curl https://<gotenberg>/health` renvoie 200 ; sans mot de passe, une conversion renvoie 401.

## 3. Vercel — l'application

> **Déjà fait** : projet Vercel `quicksign` (`prj_iTQoJMmqK9AcaqOuk0CBsGfFjPPu`, compte raoulnobou), région Paris (`cdg1`), Node 22, protection Vercel limitée aux aperçus. Variables déjà renseignées : `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` (production → `quicksign-prod`, aperçus → `quicksign-preprod`), `LINK_SECRET`, `CRON_SECRET`, `GOTENBERG_TOKEN`, `EMAIL_FROM`. Sans `NEXT_PUBLIC_APP_URL`, l'application utilise son adresse `*.vercel.app`.
>
> **Reste à faire** : (a) Vercel → Account Settings → Authentication → connecter GitHub, puis projet `quicksign` → Settings → Git → connecter `raoulnobou-ux/signature-electronique` (branche de production : `claude/bonjour-s9n385`) ; (b) ajouter `SUPABASE_SERVICE_ROLE_KEY` (clé `service_role` de `quicksign-prod` pour _Production_, de `quicksign-preprod` pour _Preview_) ; (c) les clés des services : `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `PAWAPAY_API_TOKEN`, `PADDLE_*`, `GOTENBERG_URL`.

1. https://vercel.com/new → importer le dépôt GitHub `signature-electronique` (Framework : Next.js, aucune autre option).
2. **Settings → Environment Variables** (environnement _Production_, et _Preview_ avec les clés de préproduction) :

| Variable                                                                                 | Valeur                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                                                    | `https://<votre-domaine>` (sans / final)          |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | étape 1                                           |
| `LINK_SECRET`, `CRON_SECRET`                                                             | étape 0                                           |
| `GOTENBERG_URL`, `GOTENBERG_TOKEN`                                                       | étape 2                                           |
| `RESEND_API_KEY`, `EMAIL_FROM`                                                           | étape 4 (ex. `QuickSign <bonjour@votre-domaine>`) |
| `ANTHROPIC_API_KEY`                                                                      | console.anthropic.com → API Keys                  |
| `PAWAPAY_API_TOKEN`, `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`    | étape 5                                           |
| `SENTRY_DSN`                                                                             | étape 6 (recommandé)                              |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`                                                        | `true` seulement si Google est configuré          |

**Ne pas définir** `AI_MOCK` ni `PAYMENTS_SANDBOX` en production. 3. **Deploy**. Les tâches planifiées (`vercel.json`) s'activent automatiquement ; Vercel leur envoie `CRON_SECRET`. 4. Vérifier la configuration à tout moment : `vercel env pull .env.production && npm run deploy:check -- .env.production`.

## 4. Domaine et e-mails (Resend)

1. Vercel → **Settings → Domains** → ajouter `votre-domaine` (et `www`), puis créer chez le registraire les enregistrements DNS indiqués.
2. https://resend.com → **Domains → Add** → ajouter les enregistrements **SPF, DKIM** (et **DMARC** : `v=DMARC1; p=quarantine; rua=mailto:dmarc@votre-domaine`) chez le registraire → _Verify_.
3. Resend → **API Keys** → `RESEND_API_KEY`. Mettre `EMAIL_FROM` sur ce domaine vérifié.
4. Mettre à jour `NEXT_PUBLIC_APP_URL` et les URL Supabase (étape 1.4) avec le domaine définitif, puis redéployer.

## 5. Paiements — pawaPay (FCFA, Mobile Money) et Paddle (dollars, carte)

Le prestataire est choisi selon la devise du plan : **FCFA → pawaPay**, **dollars → Paddle**.

**pawaPay** (https://dashboard.pawapay.io) :

1. Commencer en bac à sable (`PAWAPAY_ENV=sandbox`), puis passer en production une fois le compte validé (vide ou `production`).
2. **API tokens** → générer un jeton → `PAWAPAY_API_TOKEN`.
3. **Callback URLs** → dépôts (_Deposits_) : `https://<domaine>/api/webhooks/pawapay`.
4. Le client paie sur la page hébergée de pawaPay (choix de l'opérateur, saisie du numéro), puis revient sur `/api/billing/return`.

**Paddle** (https://vendors.paddle.com, ou https://sandbox-vendors.paddle.com pour les essais) :

1. **Checkout → Website approval** : faire approuver le domaine du site.
2. **Checkout → Checkout settings → Default payment link** : `https://<domaine>/app/abonnement/paiement`.
3. **Developer tools → Authentication** : créer une **clé d'API** (`PADDLE_API_KEY`) et un **jeton côté client** (`PADDLE_CLIENT_TOKEN`).
4. **Developer tools → Notifications → New destination** : URL `https://<domaine>/api/webhooks/paddle`, événements `transaction.completed`, `transaction.paid`, `transaction.payment_failed` ; copier la clé secrète → `PADDLE_WEBHOOK_SECRET`.
5. `PADDLE_ENV` : `sandbox` pour les essais (sinon déduit de la clé).

**Test réel** : se connecter avec un compte de test, Abonnement → Essentiel mensuel → payer un petit montant (FCFA par Mobile Money, puis dollars par carte) → vérifier : plan actif, reçu PDF, e-mail reçu, ligne « Payé » dans l'historique. En cas d'échec, la cause exacte est dans la table `app_errors` (Supabase → Table editor). Pour tester sans payer le plein tarif, baisser temporairement le prix dans la table `plans_config` du projet de préproduction.

## 6. Surveillance

- **Sentry** : https://sentry.io → projet _Node.js_ → copier le DSN → `SENTRY_DSN`. Les erreurs serveur y sont envoyées sans aucune donnée personnelle (ni cookie, ni jeton).
- **Disponibilité** : un moniteur (UptimeRobot, Better Stack…) sur `https://<domaine>/api/health` (200 = OK, 503 = base injoignable).
- **Vercel Analytics** : Vercel → Analytics → Enable (facultatif).

## 7. Test final avant ouverture

```bash
CRON_SECRET=<secret> npm run smoke -- https://<votre-domaine>
```

Puis, à la main, sur téléphone : inscription → e-mail de confirmation → import d'un Word → signature → téléchargement → demande de signature à 2 personnes → certificat → vérification publique → paiement réel → assistant (« repère les zones de signature » sur un contrat).

## Reprendre après un incident

- Base : Supabase → Database → Backups → restauration à un instant donné (plan Pro).
- Application : Vercel → Deployments → _Promote_ sur le déploiement précédent (retour arrière instantané).
- Ne jamais changer `LINK_SECRET` (tous les liens de signature en cours deviendraient invalides).
