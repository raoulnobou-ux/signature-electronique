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

## Fonctionnalités Pro (Phase 7)

**D67 — Cachets générés en SVG** (rond, ovale, rectangulaire ; texte circulaire par `textPath` ; encre irrégulière par filtre SVG à graine fixe). Le même SVG sert à l'aperçu, au PNG apposé (rendu ×3) et à l'archive vectorielle. Les textes sont échappés ; seuls les liens internes « #… » sont admis dans un SVG stocké.

**D68 — Liens de signature dérivés, jamais stockés.** Jeton = HMAC-SHA256(secret, identifiant du signataire + version) : le propriétaire peut recopier ou renvoyer le lien à tout moment (WhatsApp, relance) ; la base ne contient que l'empreinte SHA-256. Secret `LINK_SECRET` (à défaut, dérivé de la clé service). Pages de lien en `noindex` et `Referrer-Policy: no-referrer`.

**D69 — « Ouvert » marqué par le navigateur, pas par le serveur** : les aperçus de liens (WhatsApp, messageries) chargent la page sans exécuter de JavaScript ; seule une vraie ouverture est journalisée.

**D70 — Une version par signataire.** Chaque signature est apposée immédiatement sur la version courante (empreintes avant/après enregistrées), avec mise à jour conditionnelle et nouvelle tentative en mode parallèle. Le document final est la dernière version ; aucune retouche après la dernière signature (l'empreinte finale reste celle du certificat).

**D71 — Certificat PDF séparé du document** (identité déclarée, coordonnées, IP, appareil, horodatage local + UTC, empreintes, chronologie, cadre juridique : signature électronique simple, loi n° 2010/012 et OHADA), QR code vers `/verify/[id]`. Envoyé avec le PDF final à tous (pièce jointe ≤ 8 Mo, sinon lien de 7 jours).

**D72 — Vérification sans envoi de fichier** : l'empreinte SHA-256 est calculée dans le navigateur et comparée aux versions connues ; `/verify` (recherche par empreinte) ne révèle que le titre et la date.

**D73 — Suivi « temps réel » par actualisation discrète** (15 s) de la page de suivi tant que la demande est en cours, plutôt que Supabase Realtime (pas de publication de tables sensibles, fonctionne derrière tous les réseaux mobiles).

**D74 — Relances** : manuelles (au plus une par heure et par signataire) et automatiques (après 3 jours, 2 au maximum) par la tâche quotidienne `/api/cron/requests`, qui gère aussi l'expiration. L'annulation garde les liens lisibles (« demande annulée ») mais bloque toute signature.

**D75 — Modèles = copie du PDF + rôles + zones.** Les zones texte « variables » sont remplies par l'expéditeur à chaque utilisation et apposées sur la nouvelle copie ; les autres zones préremplissent la demande (rôle affiché à côté de chaque signataire).

**D76 — Signature en lot sans nouvelle logique serveur** : même placement (positions relatives, option « dernière page ») envoyé document par document à la finalisation unitaire (droits, quotas, audit identiques) ; ZIP construit dans le navigateur (JSZip) pour ne pas dépasser les limites des fonctions serverless.

**D77 — Équipe : une seule équipe par personne, 5 places (invitations comprises).** Les membres profitent du plan Pro du propriétaire (`team_sponsor`, pris en compte par `getEntitlements` côté application et par `can_write` côté base). Rôles : propriétaire (tout), admin (invite et retire des membres), membre. Partage explicite des cachets et modèles ; un membre qui part récupère ses éléments en privé. Gestion des membres uniquement côté serveur (plus d'écriture directe via la RLS).

## Assistant IA — QuickSign Copilot (Phase 8)

**D78 — Modèle `claude-opus-5-5` via le SDK officiel, en streaming, boucle d'outils maison.** Réflexion adaptative (par défaut sur ce modèle), effort `low` pour les questions d'usage et `medium` pour l'analyse d'un document. La boucle (`lib/ai/agent.ts`) exécute les outils en parallèle, renvoie tous les résultats dans un seul message, s'arrête proprement sur `refusal` et n'exécute jamais un appel d'outil coupé par `max_tokens`. 6 allers-retours maximum par message.

**D79 — Repli automatique en cas de refus du classifieur de sécurité** (`fallbacks: "default"`, bêta `server-side-fallback-2026-07-01`) : l'API relance d'elle-même la requête sur un modèle de repli plutôt que de renvoyer un refus sur une question légitime. Désactivable en retirant ces deux paramètres.

**D80 — Outils stricts et validés deux fois.** Schémas JSON fermés (`strict: true`, tous les champs requis) et paramètres diffusés au fil de l'eau (`eager_input_streaming`) ; chaque entrée est revalidée par Zod avant exécution (erreur renvoyée au modèle sinon). Les outils lisent via le client Supabase **de l'utilisateur** (RLS) : aucune donnée d'un autre compte n'est accessible. Essentiel : seul l'outil de visite guidée ; Pro : recherche, zones, demande, rédaction, relances, certificat.

**D81 — Aucune action irréversible par l'assistant.** Il _propose_ (zones, brouillon de demande, document rédigé, relance) sous forme de cartes ; l'utilisateur confirme lui-même (écran de préparation prérempli, bouton « Créer le PDF », bouton « Relancer »). Le brouillon de demande passe par le `sessionStorage` du navigateur, jamais envoyé seul.

**D82 — Documents envoyés uniquement sur action explicite** (bouton « Analyser », pièce jointe). Le PDF est transmis tel quel (≤ 20 Mo) avec un relevé des lignes positionnées (pdf.js côté serveur) qui permet de placer les zones au bon endroit ; seules les zones du document joint sont acceptées. L'historique stocke une référence (`document_ref` vers la version figée) réinsérée à l'identique à chaque tour : historique en ajout seul, cache de prompt efficace, pas de copie du document en base.

**D83 — Garde-fous et coûts.** Instructions figées (pas d'avis juridique, contenu des documents traité comme des données et non des instructions, instructions jamais révélées), mises en cache (`cache_control`) ; contexte minimal ajouté au message (prénom, plan, écran, quota — jamais l'e-mail). Quotas : 20 messages/jour en Essentiel (compteur `usage_counters`), Pro « illimité raisonnable » = 300/jour et 20/minute pour tous. Réponses aux suggestions fréquentes mises en cache 7 jours (`ai_faq_cache`, non lisible par les clients), sans décompter de message. Clé uniquement côté serveur.

**D84 — Mode simulé `AI_MOCK=true`** (jamais en production) : réponses scriptées qui empruntent exactement le même chemin (flux NDJSON, actions, historique, quotas). Sert au développement sans clé et aux tests de bout en bout ; la boucle réelle est testée avec un faux client (requêtes, outils, refus, troncature).

**D85 — Interface.** Bulle flottante → tiroir (plein écran sur mobile), page `/app/assistant` avec historique, entrée « Demander à l'assistant » dans la palette ⌘K, bouton « Analyser avec l'assistant » sur la fiche document. Visite guidée : attributs `data-tour` sur les éléments clés ; l'assistant ferme le panneau, ouvre la bonne page et fait pulser l'élément. Réponses rendues par un Markdown minimal sans HTML.

## Finitions, sécurité, anglais (Phase 9)

**D86 — Anglais complet de l'interface.** `messages/en.json` a exactement les mêmes clés et variables que `fr.json` (test unitaire de parité). Langue : cookie `NEXT_LOCALE` → langue du navigateur → français. Changer de langue (pied de page, pages de connexion, Paramètres) met à jour le cookie, le profil (`profiles.locale`) et les métadonnées d'authentification ; la langue du profil est réappliquée à chaque connexion. Dates, montants, tailles, mentions (« Read and approved »), pied de page horodaté du PDF signé et assistant suivent la langue.

**D87 — E-mails dans la langue du destinataire.** Titulaire du compte : langue de son profil. Signataire sans compte ou invité d'équipe : langue de l'expéditeur. E-mails d'authentification Supabase : modèles bilingues (`{{ if eq .Data.locale "en" }}`), objet bilingue. **Restent en français** : pages juridiques (CGU, confidentialité, mentions — un avertissement anglais indique que la version française fait foi), reçus de paiement et certificats de signature (documents de preuve, droit camerounais / OHADA).

**D88 — Double authentification TOTP (Supabase MFA).** Activation dans Paramètres → Sécurité (QR code + clé, premier code obligatoire), désactivation par un code valide. À la connexion, un compte protégé passe par `/connexion/verification`. L'application refuse toute donnée à une session `aal1` d'un compte protégé (`getCurrentAccount`), **et la base aussi** : politiques RLS restrictives `mfa_satisfied()` sur toutes les tables utilisateur et le stockage (un jeton volé après le mot de passe seul ne lit rien). En production : vérifier que TOTP est activé dans Supabase → Authentication → MFA.

**D89 — CSP stricte à nonce.** Nonce aléatoire par requête (proxy), `script-src 'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'` (décodeurs WebAssembly de pdf.js), aucun `unsafe-inline`/`unsafe-eval` pour les scripts en production ; styles en ligne autorisés (positions des zones). Connexions limitées à notre origine et à Supabase ; `frame-ancestors 'none'`, `object-src 'none'`, `upgrade-insecure-requests` en HTTPS. Testé : parcours complet sans aucune violation.

**D90 — PWA sobre et sûre.** Manifeste (icônes générées, raccourcis), service worker qui ne met **jamais** en cache les pages de l'application, les API ou les documents : seulement les fichiers statiques versionnés et une page hors ligne bilingue. « Installer l'application » dans le menu du compte quand le navigateur le propose. Pas de notifications push à ce stade.

**D91 — Audit.** `npm audit --omit=dev` : 0 vulnérabilité. Toutes les routes API vérifiées (session, secret de cron, signature de webhook ou RLS). Lighthouse mobile landing ≈ 93 (a11y, bonnes pratiques, SEO 100) ; tarifs 97 ; connexion 93.

## Mise en ligne (Phase 10)

**D92 — Supabase : production et préproduction en région Paris (eu-west-3)**, la plus proche du Cameroun ; Vercel en `cdg1` (Paris) pour limiter la latence base ↔ application. Schéma appliqué par migrations versionnées puis vérifié par empreinte (tables, politiques, colonnes, index, buckets identiques au local).

**D93 — Durcissement après les conseils de sécurité Supabase** : aucune fonction `SECURITY DEFINER` appelable sans connexion (PostgreSQL accorde EXECUTE à PUBLIC par défaut) ; `team_sponsor` réservée au serveur ; fonctions de déclencheur non appelables via l'API ; `search_path` figé partout ; index sur toutes les clés étrangères. Restent volontairement : les tables sans politique (réservées au serveur) et les fonctions utilisées par les politiques RLS pour les utilisateurs connectés.

**D94 — Outils d'exploitation** : `/api/health`, `npm run deploy:check`, `npm run smoke`, erreurs vers Sentry sans SDK ni donnée personnelle, Gotenberg empaqueté (`deploy/gotenberg`) pour Fly.io ou Render.

**D95 — pawaPay (FCFA) et Paddle (dollars) remplacent CinetPay.** Choix du fondateur. En production, l'API CinetPay était injoignable depuis Vercel (« fetch failed »). Le prestataire est choisi selon la devise : pawaPay (API v2, page de paiement hébergée, Mobile Money) pour le FCFA ; Paddle Billing (transaction serveur à prix unique, formulaire Paddle.js sur `/app/abonnement/paiement`) pour le dollar. Paddle est revendeur officiel et gère la TVA. Référence de paiement : un UUID v4 (identifiant de dépôt exigé par pawaPay, et `custom_data.reference` chez Paddle). L'identifiant de transaction Paddle est noté dès la création (`provider_tx_id`) pour la revérification. Les notifications Paddle sont signées (`Paddle-Signature`, HMAC-SHA256, horodatage à moins de 5 minutes). Le contenu des callbacks pawaPay n'est jamais cru : seule la référence sert, puis le dépôt est revérifié par `GET /v2/deposits/{id}`. Le reste (D58 : aucune activation sans revérification, idempotence, reçus) est inchangé.

**D96 — Journal `app_errors`** (serveur uniquement, sans donnée personnelle). Il garde la cause exacte des échecs des services externes (Claude, paiements), lisible dans Supabase quand les journaux Vercel ne sont pas accessibles. `ANTHROPIC_WORKSPACE_ID` (facultatif) ajoute l'en-tête `anthropic-workspace-id` pour les clés Anthropic non rattachées à un espace de travail.

**D97 — Paiement : le client choisit son moyen de paiement et son pays.** Le récapitulatif demande « Mobile Money (FCFA) ou carte (dollars) ». Pour le Mobile Money, il demande aussi le pays du numéro. Les pays proposés sont ceux où le compte pawaPay accepte des dépôts en franc CFA (`GET /v2/active-conf`, en cache 10 minutes), ou ceux de `PAWAPAY_COUNTRIES`. Le numéro du profil ne sert qu'à présélectionner le pays : il n'est jamais transmis, et le client saisit chez pawaPay le numéro avec lequel il paie. Un pays de l'UEMOA paie en XOF au même montant (parité XAF/XOF), et la vérification accepte l'un pour l'autre. Une mention « Mode test » s'affiche quand le prestataire est en bac à sable (paiement validé automatiquement par les numéros de test).

## Produit international (octobre 2026)

**D108 — Plusieurs prestataires de paiement, derrière une seule interface.** Aucun prestataire ne couvre seul la carte internationale et le Mobile Money africain. Chacun implémente `PaymentProvider` (`lib/billing/providers/`) avec :

- son moyen de paiement (`card` ou `mobile_money`) ;
- ses devises ;
- les pays où il vend ;
- la création du paiement, la revérification de la transaction et la lecture des notifications ;
- en option, l'annulation et le remboursement.

Le registre (`lib/billing/index.ts`) choisit le prestataire selon le moyen de paiement et la devise. `PAYMENT_PROVIDERS` active ou désactive un prestataire sans toucher au code. Ajouter un prestataire : voir `docs/PAIEMENTS.md`.

**D109 — Paddle pour la carte bancaire internationale.** Paddle est revendeur officiel (merchant of record) : il encaisse, calcule et reverse la TVA et les taxes de vente de chaque pays, gère la fraude, les remboursements et les factures conformes. Pour une petite équipe basée au Cameroun, c'est le choix le plus réaliste : Stripe n'ouvre pas de compte marchand camerounais, et un revendeur officiel évite d'avoir à déclarer soi-même la TVA de chaque pays client.

Le Cameroun ne fait pas partie des pays où Paddle refuse de vendre. Les pays refusés par Paddle (`PADDLE_BLOCKED_COUNTRIES`) ne voient pas la carte. pawaPay reste le prestataire africain (Mobile Money, zone franc CFA), séparé.

**D110 — Prix par marché, sans conversion automatique.** Chaque plan a un prix fixe par devise dans `plans_config` (FCFA, euro, dollar, livre), arrondi à un montant « rond » propre au marché, plutôt qu'un taux de change qui varierait chaque jour. La base n'impose plus la liste des devises, seulement un code ISO à trois lettres : elle vit dans `config/currencies.ts`. `payments.amount` passe en décimal (`numeric(12,2)`), parce qu'un prorata par carte a des centimes ; l'ancienne colonne entière l'aurait refusé.

**D111 — Moyens de paiement selon le pays.** Le pays du visiteur (en-tête `x-vercel-ip-country`) décide :

- de la devise affichée par défaut : FCFA en zone franc CFA, euro en zone euro, livre au Royaume-Uni, dollar ailleurs ;
- des moyens de paiement proposés : la carte partout où Paddle vend, avec un choix entre euro, dollar et livre ; le Mobile Money en zone franc CFA.

Pays inconnu : tous les moyens configurés. Le client garde toujours la main sur la devise. Un passage au Pro au prorata reste dans la devise de l'abonnement en cours.

**D112 — Accès gratuit limité à la place de l'essai de 6 jours.** Un essai complet de 6 jours laissait signer de vrais documents gratuitement, puis bloquait tout en lecture seule. Le nouveau parcours est : inscription → e-mail vérifié → accueil → accès gratuit → choix d'un plan → paiement → accès complet.

L'accès gratuit (état `free`) comprend :

- le tableau de bord et le profil ;
- l'import d'**un** document (quota `documentsStored`) ;
- l'éditeur en découverte : placer des champs, créer **une** signature, brouillon enregistré ;
- 5 messages par jour à l'assistant.

La signature finale, donc l'export du PDF signé, demande un abonnement. C'est vérifié côté serveur (`guard("sign")`) et par la RLS (`can_write`). Il en va de même pour les cachets, les demandes de signature, les modèles, la signature en lot et l'équipe. Une nouvelle fonctionnalité `edit` sépare la découverte (éditeur, signature en bibliothèque) de la signature (`sign`).

L'état « lecture seule » disparaît : un abonnement échu, annulé ou un essai terminé repasse en accès gratuit. Les documents existants restent consultables et téléchargeables, rien n'est supprimé.

Comptes existants :

- les essais en cours sont honorés jusqu'à leur fin, puis passent en gratuit (tâche quotidienne) ;
- les essais déjà terminés sont passés en gratuit par la migration.

**D113 — Limites de l'accès gratuit dans plans_config.** Une ligne `plan = 'free'` (devise XAF, prix 0, jamais affichée) porte ses limites, comme les plans payants. On les modifie dans Supabase sans redéployer. Valeurs de repli dans le code : `FREE_LIMITS` (`lib/entitlements/plans.ts`). La RLS du brouillon de l'éditeur (`placed_fields`) n'exige plus d'abonnement, seulement la propriété du document. Les documents et les signatures sont créés par le serveur après la vérification des droits.

**D114 — Tampons de statut.** Le générateur de cachets propose deux types :

- le cachet de structure (rond, ovale ou rectangulaire, déjà en place) ;
- le tampon de statut : APPROUVÉ, PAYÉ, REÇU, REFUSÉ, COPIE CONFORME, CONFIDENTIEL, URGENT.

Le tampon de statut a son libellé en français ou en anglais selon la langue, une encre usuelle par statut (modifiable), une date et un nom de structure facultatifs. Le rendu est un SVG pur (`renderStatusStampSvg`, textes échappés), enregistré en PNG et SVG comme les autres cachets. C'est un cachet ordinaire de la bibliothèque : plusieurs par compte, un par défaut, et dans l'éditeur on le place, déplace, redimensionne, pivote et règle son opacité. Réservé au plan Pro, comme tous les cachets.

**D115 — Bloc professionnel.** L'outil « Bloc professionnel » de l'éditeur pose en un toucher, sur le point choisi et sans sortir de la page :

- la signature par défaut ;
- le nom, la fonction et la structure ;
- la date du jour ;
- le cachet par défaut.

Les choix sont enregistrés dans `profiles.signature_block` (JSON validé par zod et par une contrainte de taille) et proposés au document suivant. Chaque élément devient un champ ordinaire, modifiable séparément, plutôt qu'une image figée. Ainsi, la date reste celle du jour de signature et le nom reste du texte net dans le PDF. La disposition est une fonction pure testée (`layoutSignatureBlock`). Si la signature ou le cachet manque, l'éditeur ouvre sa création puis revient au bloc.

**D116 — Profil international.** Le profil porte :

- la langue (déjà en place) ;
- le pays de résidence (`country`, ISO alpha-2) ;
- le fuseau horaire (déjà en place, désormais rempli depuis l'appareil) ;
- une devise préférée facultative (`currency`).

L'inscription n'impose plus de téléphone. Le pays détecté préremplit l'indicatif et le pays du profil, et le fuseau de l'appareil est enregistré (UTC s'il est invalide, vérifié en SQL contre `pg_timezone_names`). Le pays du profil, à défaut celui détecté, décide des moyens de paiement et du pays Mobile Money présélectionné. La devise de l'abonnement, à défaut la préférence, à défaut le pays, décide de la devise affichée.

Les dates des e-mails, des reçus, des certificats et des signatures suivent la langue et le fuseau du destinataire : plus aucune date n'est calculée à l'heure de Douala par défaut. Les reçus PDF sont en français ou en anglais.

On reste sur deux langues (français, anglais) : en ajouter une est documenté (`docs/INTERNATIONAL.md`) mais demande une vraie traduction, pas une traduction automatique.

**D117 — Signature à distance : brouillons et statuts lisibles.** Une demande peut être enregistrée en **brouillon**. Dans ce cas :

- rien n'est envoyé ;
- le document n'est pas figé ;
- les liens personnels sont refusés tant que la demande n'est pas envoyée.

Depuis le suivi, on peut ensuite la modifier (le constructeur est prérempli, puis la nouvelle version remplace l'ancienne), l'envoyer (la durée de validité repart du jour de l'envoi) ou la supprimer.

Le statut affiché est déduit du statut en base et de celui des signataires (`displayRequestStatus`, fonction pure testée) :

- Brouillon ;
- Envoyé : invitations parties, personne n'a ouvert ;
- Vu : au moins un signataire a ouvert ;
- En attente : une partie a signé, on attend les autres ;
- Signé, Refusé, Expiré, Annulé.

La liste des demandes se filtre par statut, avec le nombre de demandes de chaque statut. Chaque signataire affiche aussi la date à laquelle il a vu le document. Les statuts en base sont inchangés, donc aucune migration.

**D118 — Page Tarifs internationale et chiffres issus de plans_config.** La page Tarifs affiche :

- l'accès gratuit (carte « Gratuit ») ;
- les deux plans, dans la devise détectée et modifiable (FCFA, euro, dollar, livre) ;
- un comparatif en trois colonnes (Gratuit, Essentiel, Pro).

Les chiffres des cartes et du comparatif (documents, signatures, stockage, messages, équipe) viennent de `plans_config` via `getPlanLimits()`, comme ceux appliqués aux comptes : changer une limite en base change aussi la page, sans risque d'écart. Les noms des plans du comparatif sont traduits. Deux mentions accompagnent les prix :

- les moyens de paiement : carte partout, Mobile Money en zone franc CFA ;
- les prix sont fixés par marché sans conversion automatique, et les taxes éventuelles (TVA) sont calculées au paiement selon le pays (Paddle, revendeur officiel).

**D119 — Anti-abus mesuré.** On renforce sans gêner les utilisateurs légitimes, dont beaucoup partagent une même adresse IP (opérateurs mobiles, cybercafés, écoles, entreprises) :

- **E-mail vérifié** avant toute action (déjà en place, vérifié côté serveur par `guard`).
- **Adresses jetables refusées** à l'inscription : liste courte de services dont c'est l'unique usage (`config/disposable-domains.ts`), message clair sous le champ.
- **Inscriptions par IP en paliers** (`lib/abuse.ts`) :
  - au-delà de 10 par heure, on laisse passer mais l'événement est noté dans `app_errors`, avec une empreinte de l'IP et jamais l'adresse en clair ;
  - au-delà de 8 en 10 minutes, 30 par heure ou 100 par jour, refus temporaire avec invitation à réessayer.
  - Jamais de blocage définitif.
- **Import de fichiers** limité à 60 par heure et par compte. Les autres limites (connexion, mot de passe, 2FA, paiement, liens de signature, import par lien, assistant) étaient déjà en place.

**D120 — Conversion Word fiable.** Sous charge, ou à la première conversion après un démarrage, LibreOffice pouvait mettre plus de 20 secondes à démarrer : Gotenberg répondait alors 503 et l'import du Word échouait. Trois corrections :

- LibreOffice démarre avec le service (`--libreoffice-auto-start=true`) ;
- il dispose de 45 secondes pour démarrer (`--libreoffice-start-timeout=45s`) ;
- l'application réessaie une fois sur un 503, dans le même délai global de 90 secondes.

**D121 — Juridique et données personnelles (RGPD).** Les pages juridiques sont réécrites en français et en anglais (`content/legal/*.tsx`), au plus près du fonctionnement réel :

- confidentialité : responsable, données, finalités et bases légales, prestataires nommés avec leur localisation, transferts, durées de conservation, droits et plainte auprès de l'autorité du pays ;
- CGU : accès gratuit, abonnement prépayé sans prélèvement automatique, Paddle revendeur officiel, droits impératifs des consommateurs préservés ;
- nouvelle page **cookies**, avec l'inventaire réel : session, langue, thème, cache hors ligne ;
- mentions légales.

Elles gardent la mention « version provisoire — en cours de relecture juridique ». Aucune promesse de « conformité totale », ni de signature qualifiée ou avancée : QuickSign est présenté comme une signature électronique simple, dont la valeur repose sur la traçabilité.

Pas de bandeau cookies : il n'y a ni mesure d'audience ni publicité, seulement des éléments strictement nécessaires. Si un outil de mesure est ajouté, un consentement préalable devient obligatoire.

Consentement : la version des textes acceptés (`LEGAL_VERSION`) et sa date sont enregistrées dans le profil, à l'inscription ou à la première connexion Google (mention sous le bouton). Ces colonnes ne sont pas modifiables par l'utilisateur.

Conservation :

- à la suppression d'un compte, le registre des paiements est conservé pour la comptabilité, détaché du compte (`user_id` mis à null) ;
- la tâche quotidienne purge les journaux d'erreur (90 jours), les messages de contact (1 an) et les rappels de facturation (2 ans) ;
- le journal de preuve et le registre des paiements sont annoncés « 10 ans au plus » : leur purge au-delà de 10 ans est à mettre en place avant 2036, les plus anciennes données datant de 2026.

## Sécurité des données — référence (audit du 2 octobre 2026)

Récapitulatif de chaque mesure, à citer à un client ou un partenaire. Chacune est vérifiée par un test automatique, indiqué entre crochets.

**D98 — Chiffrement.** En transit : HTTPS partout (TLS 1.2+), HSTS, et une politique de sécurité du contenu (CSP) stricte avec un nonce par requête (D88). Au repos : la base de données, ses sauvegardes et le stockage (tous les buckets) sont chiffrés en AES-256 par Supabase, sur l'infrastructure AWS de Paris (eu-west-3). Ce chiffrement est assuré par la plateforme et toujours actif ; il n'y a pas d'option par bucket à activer. Il n'y a pas de chiffrement applicatif supplémentaire, car il empêcherait la vérification d'intégrité et la génération des PDF côté serveur.

**D99 — Cloisonnement par la base (RLS).** La Row Level Security est active sur les 27 tables du schéma `public` (vérifié en production le 2 octobre 2026). Six tables sans politique (`payment_events`, `rate_limit_hits`, `contact_messages`, `billing_notices`, `ai_faq_cache`, `app_errors`) sont donc inaccessibles depuis le navigateur : serveur uniquement. Un utilisateur ne peut lire ni modifier les données d'un autre, même en changeant un identifiant dans une URL ou en appelant l'API directement [tests d'intégration `rls`, `pro`, `billing`, `assistant`, `mfa` ; e2e `security`]. Avec la double authentification activée, une session non vérifiée ne voit aucune donnée (politiques restrictives `mfa_satisfied()`).

**D100 — Fichiers jamais publics.** Les cinq buckets (`documents`, `signatures`, `certificates`, `receipts`, `avatars`) sont privés. Les fichiers ne sont servis que par des URL signées : 2 à 5 minutes pour les téléchargements, 15 minutes pour l'affichage (30 pour les images de signature). Depuis D122, l'e-mail de fin ne contient plus d'URL signée de 7 jours, mais un lien vers la page du signataire ou de la demande, qui revérifie l'accès. Les photos de profil, auparavant publiques, passent par `/api/avatars/…` : session requise, visibles par le seul propriétaire et les membres de sa propre équipe, puis URL signée de 10 minutes [e2e `account` : propriétaire 302, inconnu 404, sans session 401, ancienne adresse publique refusée].

**D101 — Liens de signature.** Le jeton fait 256 bits : HMAC-SHA256 de l'identifiant du signataire et d'une version, avec `LINK_SECRET`, encodé en base64url sur 43 caractères. La base ne stocke que son empreinte SHA-256. Chaque lien expire avec la demande (une date d'expiration est toujours fixée, et une tâche quotidienne fait expirer les demandes échues). Une relance ou une révocation change la version et invalide l'ancien lien. Une fois la signature faite, le lien ne permet plus que la consultation et le téléchargement. Toute forme de jeton invalide est rejetée avant toute requête en base [e2e `signing`, `requests`].

**D102 — Aucun secret dans le navigateur.** Les modules serveur (`lib/env.server.ts`, `lib/supabase/admin.ts`, prestataires) importent `server-only` : la compilation échoue s'ils sont importés côté client. `npm run check:bundle` analyse tout `.next/static` après le build : noms des variables secrètes, formats de clés (Anthropic, Paddle, Resend), jetons Supabase autres que `anon` et valeurs réelles des secrets. Il est lancé à chaque intégration continue. Résultat au 2 octobre 2026 : 75 fichiers, aucun secret.

**D103 — Droits et quotas vérifiés côté serveur.** Chaque action payante passe par `guard(feature, quota)` côté serveur : import, signature, cachets, demandes à plusieurs, relances, modèles, équipe, assistant IA (fonctions avancées et quota quotidien). Les politiques RLS d'écriture exigent en plus un compte actif (`can_write`) : un compte expiré ne peut rien créer, même via l'API [test `rls` « compte expiré »]. L'audit a ajouté deux contrôles qui manquaient : la relance d'un signataire et le partage d'un cachet avec l'équipe.

**D104 — Journal d'audit inaltérable.** Il fonctionne en ajout seul pour tous, y compris l'administrateur. Les droits UPDATE, DELETE et TRUNCATE sont retirés aux rôles `anon`, `authenticated` et `service_role`. Un déclencheur ligne refuse toute modification ou suppression, et un déclencheur instruction refuse le TRUNCATE, même pour le super-utilisateur `postgres` (vérifié). Seule une migration de schéma, versionnée dans Git et donc traçable, pourrait retirer ces protections. La suppression d'un compte conserve son historique (actions et identifiant technique), car il sert de preuve aux autres signataires ; le contenu des documents, lui, est effacé [test `rls` « journal d'audit »].

**D105 — Droits des utilisateurs.** Paramètres → Zone sensible : « Exporter mes données » télécharge en JSON le profil, l'abonnement, les paiements, la liste des documents et versions, les signatures, les demandes et signataires, les modèles et le journal d'audit. « Supprimer mon compte » efface tous les fichiers des cinq buckets puis le compte (les lignes liées sont supprimées en cascade) [e2e `account`]. Les demandes écrites sont traitées par e-mail à supportquicksignapp@gmail.com. Conservation : documents tant que le compte existe (même expiré, en lecture seule), corbeille vidée après 30 jours, journal d'audit conservé.

**D106 — Page publique « Sécurité et confidentialité »** (`/securite`). Elle explique en langage simple, en français et en anglais : protections, hébergement (UE, Paris), chiffrement, qui a accès (prestataires listés, aucune revente), durée de conservation, export et suppression, et validité juridique.

**D107 — Finitions (2 octobre 2026).**

- Pages d'erreur à l'image de la marque (`app/error.tsx`, `app/global-error.tsx`) : message rassurant en français ou en anglais, boutons « Réessayer » (`retry`, Next.js 16) et « Retour à l'accueil », et seulement la référence `digest` de l'erreur, jamais de détail technique.
- Erreurs de l'assistant liées à la configuration (clé, crédit, espace de travail) : message neutre côté client, cause exacte dans `app_errors`.
- États vides illustrés pour l'historique des paiements, l'activité d'équipe et l'historique de l'assistant (documents, demandes et modèles l'étaient déjà).
- Relecture de l'ensemble des 1 358 textes français de l'interface (et de leurs équivalents anglais) : formulations « locales » remplacées pour le positionnement international, partenaires de paiement nommés, libellés plus précis (« Case à cocher », export).
- Mesure en 3G lente (Chrome « Slow 3G », mobile) : texte de l'accueil visible à environ 3,3 s en première visite (333 Ko au total, dont 106 Ko pour React/Next et 69 Ko de polices en `font-display: swap`), pages suivantes quasi instantanées grâce au cache.
- Aucun faux témoignage : la section ne s'affiche qu'avec de vrais avis (`content/testimonials.ts`).

**D122 — Audit de sécurité du 5 octobre 2026 (défense en profondeur).** Démarche : auditer, identifier, renforcer, tester. Détail et liste de contrôle dans `SECURITY.md`. Failles trouvées et corrigées :

- **Privilèges trop larges.** Le rôle `anon` gardait des droits sur toutes les tables (la RLS bloquait, mais une seule politique mal écrite aurait suffi). Retirés, sauf la lecture de `plans_config`. Le rôle `authenticated` perd l'écriture directe sur 16 tables écrites par le serveur seul (paiements, abonnements, journal, versions, équipes…). Migration `20261006000100_security_hardening_4.sql`.
- **Dossier d'autrui.** Un utilisateur pouvait ranger son document, ou créer un sous-dossier, dans le dossier d'un autre en connaissant son identifiant. Politique `owns_folder()` ajoutée.
- **Corbeille et équipe.** Un document mis à la corbeille restait lisible et téléchargeable par les membres de l'équipe. Il n'est plus visible que de son propriétaire ; le téléchargement d'un document à la corbeille est refusé.
- **Lien de 7 jours dans l'e-mail de fin.** Remplacé par un lien vers la page du signataire ou de la demande. Toutes les autres URL signées sont ramenées à 15 minutes au plus (5 pour le téléchargement final).
- **Assistant IA.** Un document cité dans une ancienne conversation restait envoyé au modèle après la perte d'accès (équipe quittée, document supprimé). L'accès est maintenant revérifié à chaque message. La route vérifie aussi l'origine (CSRF) et limite le corps à 64 Ko.
- **Suppression du compte sans réauthentification.** Le mot de passe actuel est désormais exigé, ou une connexion Google de moins de 10 minutes. Cinq essais par 10 minutes au plus.

Protections ajoutées :

- cookies de session forcés en `HttpOnly`, `Secure` en production et `SameSite=Lax` ; suppression du client Supabase navigateur, devenu inutile ;
- onglet Sécurité : dernière connexion, liste des sessions actives (fonction `my_sessions()`, limitée à l'utilisateur), « Déconnecter les autres appareils » et « Se déconnecter partout » ;
- journal d'audit complété, sans contenu de document : téléchargement, suppression définitive, export des données, suppression du compte, déconnexions, demande de changement de mot de passe, création et suppression de signatures ;
- export des données limité à 10 par heure ;
- en-têtes `Cross-Origin-Opener-Policy: same-origin` et `X-Permitted-Cross-Domain-Policies: none` ;
- Gotenberg durci : routes Chromium et PDF désactivées, téléchargement d'URL distantes interdit, webhooks vers des IP privées refusés, conteneur en lecture seule sans privilèges ni capacités, mémoire et processus limités ;
- garde de déploiement `scripts/build-guard.mjs`, lancée avant le build (`prebuild`) : en production Vercel, elle fait échouer le build si une variable critique manque ou est faible (URL Supabase non HTTPS, clés absentes, `LINK_SECRET` de moins de 32 caractères, `CRON_SECRET` de moins de 16, `AI_MOCK=true`).

Tests : `tests/integration/security.test.ts` couvre 12 scénarios avec de vrais comptes A et B :

- lecture, modification et suppression par identifiant ;
- visiteur anonyme ;
- corbeille d'équipe ;
- URL signée expirée ;
- paiement ou abonnement forgé ;
- `user_id` falsifié ;
- dossier d'autrui ;
- traversée de chemin ;
- signatures et cachets ;
- sessions ;
- tables réservées au serveur.

L'e2e `security` vérifie aussi les cookies, l'onglet Sécurité et le refus d'une origine étrangère. L'e2e `account` vérifie la suppression avec mot de passe.

Restent hors du code (voir `SECURITY.md`) :

- antivirus des fichiers importés ;
- double authentification obligatoire pour les comptes administrateurs Supabase et Vercel ;
- test de restauration de sauvegarde ;
- test d'intrusion externe.

Les 5 alertes `npm audit` restantes concernent uniquement les outils de développement (eslint).

**D123 — Notch Pay, seul prestataire de paiement pour commencer (9 octobre 2026).** pawaPay et Paddle sont retirés : code, routes de notification (`/api/webhooks/pawapay`, `/api/webhooks/paddle`), page de paiement Paddle, variables d'environnement, CSP et textes juridiques. Notch Pay (`lib/billing/providers/african/notchpay.ts`) les remplace :

- paiement en FCFA sur la page hébergée de Notch Pay : MTN Mobile Money, Orange Money ou carte bancaire ;
- proposé dans tous les pays : tant qu'aucun prestataire n'accepte l'euro, le dollar ou la livre, le récapitulatif bascule sur le prix en FCFA ;
- le client ne choisit plus de pays sur QuickSign, la page Notch Pay propose elle-même les moyens disponibles ;
- clé publique `NOTCHPAY_PUBLIC_KEY` (`pk_test.…` = mode test affiché) ; `NOTCHPAY_WEBHOOK_SECRET` recommandée.

Sécurité, inchangée dans son principe :

- la transaction est toujours relue par l'API Notch Pay (`GET /payments/{référence}`) avant activation ;
- elle doit porter notre référence (`merchant_reference`), son montant et sa devise sont revérifiés ;
- une transaction de test est refusée avec une clé de production ;
- l'identifiant Notch Pay noté à la création est préféré à celui reçu au retour du navigateur ;
- la signature `x-notch-signature` (HMAC-SHA256, temps constant) est exigée dès que la clé de hachage est configurée.

L'interface `PaymentProvider` et le registre restent prêts pour ajouter d'autres moyens de paiement au fur et à mesure (`docs/PAIEMENTS.md`). Les anciens paiements gardent leur prestataire et leurs reçus. Version des textes juridiques : `2026-10-09`.
