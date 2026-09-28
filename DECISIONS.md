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

## Documents (Phase 4)

**D38 — Envoi direct navigateur → stockage.** Le serveur vérifie droits et quota de stockage puis délivre une URL d'envoi signée ; le fichier part directement vers Supabase Storage (XHR, barre de progression réelle), sans passer par la limite de taille des fonctions serverless. Le serveur finalise ensuite : lecture du fichier, vérification du type réel, conversion, empreinte, création du document.

**D39 — Type réel vérifié par les octets**, jamais par l'extension : PDF, JPEG, PNG, DOCX/ODT (archive ZIP inspectée), DOC (OLE), RTF. Les PDF chiffrés ou corrompus sont refusés avec un message clair. Analyse antivirus : non intégrée à ce stade (pas de service gratuit fiable sans infrastructure dédiée) ; l'architecture permet d'ajouter un appel ClamAV à la finalisation.

**D40 — Conversion Word → PDF derrière une interface `DocumentConverter`**, implémentée par Gotenberg (authentification basique : utilisateur `quicksign`, mot de passe `GOTENBERG_TOKEN`). CloudConvert pourra être branché sans toucher au reste. L'original est toujours conservé.

**D41 — Version 0 = PDF de travail.** Chaque document a une version 0 (original PDF, ou PDF issu de la conversion) avec son SHA-256 ; les versions signées s'ajoutent ensuite (Phase 5), l'original n'est jamais modifié.

**D42 — Vignettes générées dans le navigateur** (première page rendue par pdf.js, JPEG ≈ 20 Ko) puis envoyées au serveur : pas de moteur de rendu PDF côté serveur.

**D43 — pdf.js en build « legacy ».** La build standard de pdf.js 6 exige des navigateurs très récents (API `Map.getOrInsertComputed`) ; la build legacy embarque les polyfills et fonctionne sur les téléphones Android plus anciens, très répandus. Worker, CMaps et polices standard sont copiés dans `public/pdfjs/<version>/` à l'installation.

**D44 — Scanner intégré sans dépendance.** Détection de la feuille (seuil d'Otsu + plus grande zone claire), coins ajustables au doigt, redressement par homographie, mode « document » (niveaux automatiques). Plusieurs pages → un PDF assemblé dans le navigateur. Les photos sont réduites à 2480 px (A4 à 300 dpi) avant envoi.

**D45 — Import par lien protégé contre la SSRF** : seuls http/https, pas d'identifiants dans l'URL, IP littérales et noms locaux refusés, résolution DNS contrôlée au moment de la connexion (anti-rebinding), redirections suivies manuellement et revérifiées, 25 Mo et 20 s maximum. Liens Google Drive / Dropbox / OneDrive convertis en téléchargement direct.

**D46 — Le journal d'audit survit aux documents.** Pas de clé étrangère depuis `audit_events` : la suppression définitive d'un document conserve sa trace (sinon « on delete set null » modifierait des lignes immuables).

**D47 — Filtres de la liste dans l'URL** (partageables, bouton retour), paramètres « voulus » gardés en mémoire pour éviter qu'une recherche différée n'écrase une navigation en cours sur réseau lent. Dates relatives calculées côté navigateur (pas d'écart d'hydratation).

**D48 — Corbeille : purge automatique à 30 jours** par une tâche planifiée quotidienne (`/api/cron/purge-trash`, protégée par `CRON_SECRET`, déclarée dans `vercel.json`).

## Signature et éditeur (Phase 5)

**D49 — Positions en pourcentage de la page affichée.** Chaque élément est stocké en % (x, y, largeur, hauteur) de la page telle que l'utilisateur la voit : indépendant du zoom et de l'écran. Au moment de signer, une matrice de transformation gère la rotation de page (0/90/180/270), le décalage de la CropBox et la rotation propre de l'élément autour de son centre.

**D50 — Le PDF signé est produit côté serveur**, jamais dans le navigateur : droits (quota mensuel, cachets réservés au Pro), images de la bibliothèque et fichier source sont relus depuis le stockage, ce qui empêche d'apposer une image qui n'appartient pas au compte. Le client n'envoie que la liste des éléments (validée par zod).

**D51 — Chaque signature crée une nouvelle version** (`v1.pdf`, `v2.pdf`…) avec SHA-256 avant/après dans le journal d'audit. La mise à jour est conditionnelle sur `current_version` : deux finalisations simultanées ne peuvent pas écraser la même version.

**D52 — Signatures stockées en PNG transparent et en SVG.** Le PNG est apposé sur le PDF (rendu identique partout) ; le SVG garde une version vectorielle pour les usages futurs (certificat, impression haute définition). Une seule signature et un seul paraphe « par défaut » par compte (index unique partiel).

**D53 — Écritures manuscrites auto-hébergées** (6 polices sous licence OFL, woff2) : aucun appel externe, rendu identique sur réseau lent.

**D54 — Texte apposé en Helvetica (police standard PDF)** : aucune police à embarquer, PDF léger. Les caractères non encodables sont remplacés proprement (le français est entièrement couvert).

**D55 — Historique local et brouillon automatique.** Annuler/rétablir en mémoire (80 étapes) ; un geste (glisser, redimensionner) compte pour une seule étape. Le brouillon est enregistré 1 s après la dernière modification et restauré à la réouverture.

**D56 — Rendus pdf.js annulables.** Chaque canevas garde son rendu en cours ; un zoom ou le démontage de la page l'annule proprement (l'annulation n'est pas une erreur). Après une action serveur, pas de `router.refresh()` en plus du `revalidatePath` : un rafraîchissement concurrent d'un changement de filtre pouvait réafficher l'ancienne liste.

## Abonnements et paiements (Phase 6)

**D57 — CinetPay derrière une interface `PaymentProvider`** (`createCheckout`, `verifyTransaction`, `parseWebhook`). Choix du fondateur : CinetPay (Mobile Money MTN et Orange au Cameroun, cartes), à la place de Flutterwave initialement prévu dans le cahier des charges. Checkout hébergé `POST /v2/payment` (canal `ALL` en FCFA, `CREDIT_CARD` en dollars), vérification `POST /v2/payment/check`. Identifiant de transaction `QS-` + 24 caractères alphanumériques (CinetPay refuse les caractères spéciaux). La documentation n'était pas joignable depuis l'environnement de développement (seuls des extraits l'étaient) : **à valider avec un vrai compte CinetPay avant la mise en ligne** (Phase 10), notamment les champs client exigés pour la carte et les montants en dollars. Un autre prestataire (Notch Pay, Flutterwave) s'ajoute sans toucher au reste.

**D58 — Aucune activation sans revérification serveur.** La notification (`notify_url`) et le retour navigateur (GET ou POST) ne font que déclencher `settlePayment`, qui interroge `/v2/payment/check` et contrôle statut (`ACCEPTED`), référence, montant et devise. Les paramètres reçus ne sont jamais crus. Notification authentifiée par l'en-tête `x-token` (HMAC-SHA256 des champs `cpm_*` concaténés, avec la clé secrète) et le Site ID ; journalisée dans `payment_events` avec une clé d'idempotence ; une erreur renvoie 500 pour que CinetPay réessaie. L'URL répond 200 au test de disponibilité (GET).

**D59 — Activation atomique en base** (`complete_payment`, verrou sur le paiement et l'abonnement, exécutable par le seul rôle service) : webhook et retour navigateur peuvent arriver en même temps, un seul active l'abonnement et numérote le reçu.

**D60 — Pas de prélèvement automatique.** Mobile Money ne le permet pas : chaque paiement couvre une période (mensuelle ou annuelle). Rappels J-5, J-2 (« bientôt expiré ») et jour J avec lien de paiement, puis 3 jours de grâce, puis lecture seule. Le paiement par carte récurrente pourra s'ajouter plus tard si le prestataire le permet.

**D61 — Aucun jour perdu.** Un paiement pendant l'essai ou avant l'échéance enchaîne la nouvelle période à la fin de l'actuelle ; si le plan change, la bascule est programmée à cette date (`scheduled_plan_at`) et appliquée par `getEntitlements` sans attendre la tâche planifiée. Essentiel → Pro : immédiat, au prorata des jours restants (arrondi au multiple de 5 FCFA supérieur, au centime en USD, 100 FCFA / 1 $ minimum). Pro → Essentiel ou annulation : à l'échéance.

**D62 — Annulation = `cancel_at_period_end`** (le statut reste « active ») : accès complet jusqu'à la fin de la période payée, pas de rappel ni de période de grâce ensuite. `can_write` (RLS) et `getEntitlements` appliquent la même règle.

**D63 — Reçus PDF numérotés** `QS-AAAA-000001` (séquence en base), générés avec pdf-lib, rangés dans le bucket privé `receipts`, joints à l'e-mail de confirmation et téléchargeables par URL signée de 2 minutes.

**D64 — Bac à sable de paiement** pour le développement et les tests e2e (`PAYMENTS_SANDBOX=true`, sans clé CinetPay) : checkout simulé dans l'application, identifiant de transaction signé par le serveur (impossible à forger), désactivé d'office en production Vercel et dès que CinetPay est configuré.

**D65 — Tâche quotidienne de facturation** (`/api/cron/billing`, 7 h UTC = 8 h à Douala) : fin d'essai J-2 et essai terminé, rappels, passage en grâce puis en lecture seule, bascules de plan, paiements abandonnés (> 24 h). Chaque e-mail est réservé dans `billing_notices` avant envoi : relancer la tâche ne crée aucun doublon.

**D66 — Navigations et actions serveur dans des transitions séparées** (liste des documents) : une navigation de filtre lancée juste après une action (ex. déplacer puis ouvrir le dossier) pouvait être perdue quand elle partageait la transition de l'action.
