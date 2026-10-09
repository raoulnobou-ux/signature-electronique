# Sécurité de QuickSign

Principe : **les documents appartiennent à leurs utilisateurs, QuickSign ne doit jamais permettre un accès non autorisé.**

L'architecture applique la **défense en profondeur** : chaque couche suppose que la précédente peut échouer. Ce document est la checklist de référence. Elle se met à jour à chaque changement qui touche aux données, à l'authentification ou aux fichiers.

QuickSign n'est pas « inviolable » : aucun logiciel ne l'est. L'objectif est une architecture robuste, défensive et auditable. Un audit externe (section 20) reste recommandé avant d'héberger des documents à fort enjeu.

Dernier audit interne : **6 octobre 2026**. Tests de sécurité automatisés : `tests/integration/security.test.ts`, `tests/integration/rls.test.ts`, `tests/e2e/security.spec.ts`.

---

## 1. Les couches de protection d'un document

```
Requête
  → HTTPS + HSTS (aucun transport en clair)
  → Session : cookie HttpOnly + Secure + SameSite=Lax, vérifiée par Supabase Auth (getUser)
  → 2FA : sans le code, la base refuse toute donnée (RLS mfa_satisfied)
  → Autorisation serveur : guard(fonction, quota), propriétaire déduit de la session
  → RLS PostgreSQL : chaque ligne filtrée par auth.uid(), même si le code se trompe
  → Privilèges SQL : les tables écrites par le serveur refusent toute écriture du navigateur
  → Stockage privé : dossier <user_id>/…, aucune lecture hors de son dossier
  → URL signée courte (2 à 15 min), générée après tout cela
  → Journal d'audit en ajout seul (téléchargement, suppression, signature…)
```

## 2. Checklist

### Contrôle d'accès

- [x] **RLS activée sur toutes les tables** de `public` (vérifié par requête, aucune exception).
- [x] Les politiques reposent sur `auth.uid()` : jamais sur un identifiant envoyé par le client.
- [x] **Le propriétaire est toujours déduit de la session** côté serveur (`owner_id: account.userId`). Un `user_id`, `owner_id`, `team_id` ou rôle envoyé par le navigateur n'est jamais cru.
- [x] **Privilèges SQL en seconde ligne** (`security_hardening_4`) :
  - aucun droit pour le rôle `anon`, sauf lire les tarifs ;
  - aucune écriture du navigateur sur les tables écrites par le serveur seul : paiements, abonnements, versions, signataires, demandes, journal, compteurs, membres d'équipe, invitations.
- [x] **Colonnes protégées.** Seules ces colonnes sont modifiables par l'utilisateur : titre, dossier, corbeille et équipe pour un document ; champs du profil (pas l'acceptation des CGU ni les dates d'essai).
- [x] **Rangement** uniquement dans ses propres dossiers (`owns_folder`), y compris pour les sous-dossiers.
- [x] **Équipes** : un document partagé n'est visible que des membres de l'équipe (`is_team_member`), et plus du tout une fois à la corbeille. La gestion de l'équipe passe par le serveur, avec vérification du rôle.
- [x] **Code serveur avec la clé de service** (contourne la RLS) : chaque usage vérifie l'appartenance avant d'agir. Les 40 fichiers concernés ont été relus le 6 octobre 2026.
- [x] Fonctions `security definer` : `search_path` vide, droits d'exécution limités. Aucune n'est appelable par `anon`.

### Stockage et fichiers

- [x] **Cinq buckets, tous privés** : documents, signatures, reçus, certificats, avatars.
- [x] Lecture directe limitée au dossier `<user_id>/` du compte ; aucune écriture directe (envoi par URL signée émise par le serveur).
- [x] **Chemins générés par le serveur** : `<user_id>/<uuid>/…`, jamais à partir du nom de fichier. Le nom d'origine est seulement nettoyé et gardé comme métadonnée.
- [x] **URL signées courtes** :
  - téléchargements : 2 à 5 min ;
  - visionneuses et miniatures : 15 min ;
  - images de signature : 30 min ;
  - plus aucune URL de plusieurs jours : le document final trop lourd pour une pièce jointe passe par le lien personnel du signataire, ou par l'espace du propriétaire.
- [x] **Téléchargement** :
  - session, puis RLS (propriétaire ou équipe), puis refus si le document est à la corbeille ;
  - le chemin doit appartenir au document (anti-traversée) ;
  - URL signée de 5 min, puis événement `document.downloaded` au journal.
- [x] **Signatures, paraphes et cachets** : bucket privé, PNG vérifié par signature binaire, SVG produit par l'application et filtré (aucun script ni référence externe).

### Import de fichiers

- [x] Formats acceptés : PDF, Word (DOCX, DOC), ODT et RTF, images (PNG, JPEG, WebP).
- [x] **Type réel lu dans les octets** (`sniffFileType`), jamais l'extension ni le type MIME annoncés. L'original est renommé selon son type réel ; un type inconnu est refusé et le fichier effacé.
- [x] Taille maximale : 25 Mo par fichier (bucket et serveur), plus le quota de stockage du plan.
- [x] Fichiers chiffrés ou corrompus refusés avec un message clair.
- [x] Import par lien : protection SSRF (adresses internes refusées, redirections vérifiées, délai et taille bornés).
- [x] Limites : 60 imports par heure et par compte, 20 imports par lien par heure.
- [ ] **Antivirus** : non intégré (voir section 19). Atténuations en place : contrôle du type réel, conversion isolée et sans réseau, PDF affiché par pdf.js (aucun JavaScript du PDF exécuté), originaux servis en téléchargement.

### Conversion Word → PDF (Gotenberg / LibreOffice)

- [x] Service séparé : il ne détient aucun secret de l'application, aucun accès à la base ni au stockage. Il reçoit un fichier et renvoie un PDF.
- [x] **Surface minimale** : seule la route LibreOffice est ouverte. Sont désactivés :
  - Chromium et la fusion PDF ;
  - le téléchargement d'URL (`downloadFrom`, qui permettrait une attaque SSRF) ;
  - les webhooks (adresses privées et publiques refusées).
- [x] Authentification basique, délai de 60 s, corps limité à 30 Mo, file d'attente bornée, LibreOffice redémarré toutes les 50 conversions, fichiers temporaires effacés après chaque conversion.
- [x] Conteneur local : système de fichiers en lecture seule (sauf `/tmp`), aucune capacité Linux, `no-new-privileges`, mémoire limitée à 1 Go, nombre de processus borné. Fly.io : machine dédiée de 1 Go, sans volume persistant.
- [ ] Fly.io : limiter aussi le trafic sortant de la machine (non disponible simplement ; voir section 19).

### Authentification et sessions

- [x] Mots de passe hachés par Supabase Auth (bcrypt) ; politique : 8 caractères minimum, avec lettres et chiffres.
- [x] E-mail vérifié obligatoire ; liens de confirmation et de réinitialisation à usage unique et expirants (`token_hash`).
- [x] **Cookies de session HttpOnly**, Secure en HTTPS, SameSite=Lax. Aucun code du navigateur n'accède à la session ; le client Supabase du navigateur a été supprimé.
- [x] Session vérifiée auprès du serveur d'authentification à chaque requête (`getUser`), et pas seulement décodée.
- [x] **2FA (TOTP)** : activation et désactivation par code. Une session sans le code ne voit aucune donnée (RLS).
- [x] **Page Sécurité** :
  - dernière connexion ;
  - appareils connectés (navigateur, IP, dernière activité ; aucun jeton affiché) ;
  - « déconnecter les autres appareils » et « se déconnecter partout » ;
  - changement de mot de passe par lien e-mail.
- [x] **Réauthentification** avant la suppression du compte : mot de passe revérifié, ou connexion de moins de 10 minutes pour un compte Google.
- [x] Limites anti-force brute : connexion (par IP et par compte), réinitialisation, 2FA, réauthentification.
- [ ] Révocation d'une session précise (plutôt que de toutes les autres) : à ajouter quand Supabase Auth l'exposera.

### API, Server Actions et CSRF

- [x] Toutes les entrées sont validées par zod (identifiants UUID, longueurs, énumérations).
- [x] Server Actions : vérification d'origine intégrée à Next.js.
- [x] Routes d'API avec cookie : origine vérifiée (`isSameOriginRequest`) et corps limité (assistant).
- [x] SameSite=Lax : aucun cookie de session envoyé sur une requête POST venant d'un autre site.
- [x] Erreurs neutres pour l'utilisateur (identifiant `digest`) ; la cause détaillée reste côté serveur.
- [x] Export CSV du journal protégé contre l'injection de formules.

### Liens de signature à distance

- [x] Jeton de 256 bits : HMAC-SHA256 de l'identifiant du signataire et d'une version, avec `LINK_SECRET`. Seule son empreinte SHA-256 est stockée. Ce n'est jamais un identifiant de document.
- [x] Expiration avec la demande ; révocation (annulation, relance qui change la version) ; statuts ; limites par IP et par jeton ; journal complet.
- [x] Un brouillon de demande n'a aucun lien valide avant son envoi.

### Paiements et webhooks

- [x] **Notch Pay** : signature `x-notch-signature` (HMAC-SHA256, comparaison en temps constant) exigée dès que `NOTCHPAY_WEBHOOK_SECRET` est configurée. Dans tous les cas le contenu n'est jamais cru : seule la référence sert, puis la transaction est **relue par l'API**. Elle doit porter notre référence, et une transaction de test est refusée avec une clé de production.
- [x] Idempotence : événements uniques (`payment_events`) ; `complete_payment` transactionnel avec verrou de ligne, sans double prolongation.
- [x] Montant et devise revérifiés contre le paiement attendu. Un faux retour de paiement n'active rien (testé de bout en bout).
- [x] Aucune donnée de carte ni de compte Mobile Money ne transite par QuickSign.

### Secrets et configuration

- [x] Aucune clé dans le dépôt : historique Git vérifié, seul `.env.example` est versionné, avec des noms et sans valeurs.
- [x] Modules serveur protégés par `server-only`. `npm run check:bundle` vérifie à chaque intégration continue qu'aucun secret ni nom de variable secrète n'est présent dans le JavaScript public.
- [x] **Garde-fou de déploiement** (`scripts/build-guard.mjs`) : la compilation de production échoue si les clés Supabase, `LINK_SECRET` ou `CRON_SECRET` manquent, ou si l'IA simulée est active.
- [x] Tâches planifiées protégées par `CRON_SECRET` ; `/api/health` ne révèle que la présence des variables, jamais leur valeur.

### Journaux et audit

- [x] **Journal d'audit en ajout seul**, même pour l'administrateur de la base : déclencheurs contre la modification, la suppression et le TRUNCATE.
- [x] Événements enregistrés :
  - documents : import, téléchargement, corbeille, restauration, suppression définitive, signature ;
  - signatures et cachets : création, suppression, partage ;
  - demandes : création, envoi, consultation, signature, refus, expiration, annulation ;
  - équipe ; paiements ;
  - compte : export, suppression ;
  - sécurité : 2FA, déconnexions, demande de changement de mot de passe.
- [x] Le journal ne contient **jamais** le contenu d'un document : seulement l'événement, l'acteur, la date, l'IP, l'appareil et des métadonnées minimales.
- [x] Journaux techniques (`app_errors`) : message d'erreur du service, jamais de jeton, de mot de passe ni de document. IP hachées dans les compteurs anti-abus. Purge après 90 jours.

### Chiffrement

- [x] En transit : HTTPS partout, HSTS de 2 ans (`includeSubDomains`, `preload`), `upgrade-insecure-requests`.
- [x] Au repos : chiffrement AES-256 de l'infrastructure Supabase (base, stockage, sauvegardes).
- [x] Primitives reconnues uniquement : HMAC-SHA256, SHA-256, bcrypt (Supabase), TOTP (RFC 6238). Aucune cryptographie maison.
- [ ] Chiffrement applicatif des documents (enveloppe, clé par compte dans un KMS) : non mis en place, voir section 19.

### Intégrité des documents

- [x] Empreinte SHA-256 de chaque version et du document final.
- [x] Page publique de vérification : dépôt du fichier, comparaison locale de l'empreinte.
- [x] Présentée comme une **preuve d'intégrité**, pas comme une garantie juridique.

### En-têtes et navigateur

- [x] CSP stricte avec un nonce par requête et `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- [x] `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- [x] `Permissions-Policy` minimale, `Cross-Origin-Opener-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, aucun `X-Powered-By`.
- [x] XSS : React échappe tout. Les deux seuls `dangerouslySetInnerHTML` affichent un SVG généré localement, avec les textes échappés.

### IA

- [x] Un document n'est **jamais** envoyé à l'IA sans une action explicite de l'utilisateur (joindre le document).
- [x] L'accès au document est revérifié à chaque échange, y compris pour les documents joints plus tôt dans la conversation.
- [x] Données non utilisées pour l'entraînement (conditions de l'API Anthropic) ; conversations supprimables par l'utilisateur.
- [ ] Minimisation plus fine (envoyer un extrait plutôt que le PDF entier quand la question le permet) : à étudier.

### Suppression et conservation

- [x] Corbeille de 30 jours, puis purge automatique de la ligne et de **tous** les fichiers du dossier : original, PDF, versions, miniature.
- [x] Suppression du compte : tous les fichiers des cinq buckets, puis le compte (en cascade). Seuls restent le journal de preuve et le registre comptable des paiements, détaché du compte.
- [x] Conservation détaillée dans la politique de confidentialité (`content/legal/privacy.tsx`) et purges automatiques.

### Environnements

- [x] Production (`quicksign-prod`) et préproduction (`quicksign-preprod`) : deux projets Supabase distincts. Les aperçus Vercel utilisent la préproduction.
- [x] Aucune copie de la base de production vers un environnement de test. Les tests utilisent une base locale jetable.
- [x] Aperçus Vercel protégés (Vercel Authentication).

### Dépendances

- [x] `npm audit --omit=dev` : **0 vulnérabilité** en production (6 octobre 2026).
- [x] 5 alertes « high » dans la chaîne de développement (`eslint-config-next` → `braces`, déni de service par motif glob). Aucun effet en production ; non corrigées, car le seul correctif proposé est une régression majeure d'ESLint. À revoir à la prochaine version de `eslint-config-next`.

---

## 3. Sauvegardes et restauration

- Supabase sauvegarde la base chaque jour, chiffrée, accessible uniquement depuis le tableau de bord du projet. La durée de conservation dépend du plan : 7 jours sur Pro ; restauration à un instant précis (PITR) en option.
- Le **stockage des fichiers** n'est pas inclus dans ces sauvegardes : prévoir une copie régulière des buckets vers un stockage externe chiffré.
- **Exercice de restauration à faire chaque trimestre** :
  1. restaurer la sauvegarde la plus récente dans un projet Supabase temporaire ;
  2. vérifier les comptes, les documents et les empreintes ;
  3. supprimer le projet temporaire.

  Une sauvegarde jamais restaurée n'est pas une stratégie de reprise.

- Ne jamais restaurer une sauvegarde de production dans la préproduction (données réelles).

## 4. Accès administrateur

- Aucun tableau de bord administrateur n'expose le contenu des documents.
- L'accès aux données passe par le tableau de bord Supabase, réservé au fondateur, avec 2FA obligatoire sur les comptes Supabase, Vercel, GitHub et Notch Pay.
- Si un accès exceptionnel à un document est nécessaire pour le support :
  - accord écrit de l'utilisateur ;
  - durée limitée et accès minimal ;
  - justification notée dans le journal ;
  - jamais de téléchargement sur un poste personnel.

---

## 5. Recommandations restantes (par priorité)

1. **Audit externe et test d'intrusion** (section 6) avant d'accueillir des clients aux documents à fort enjeu.
2. **Antivirus des fichiers importés** : service ClamAV isolé, comme Gotenberg, appelé avant la conversion. Les fichiers infectés sont refusés et effacés.
3. **Sauvegarde des fichiers** (buckets) hors Supabase, chiffrée, avec un exercice de restauration documenté.
4. **Surveillance** : brancher Sentry (`SENTRY_DSN`), avec des alertes sur les erreurs 5xx, les échecs de webhook et les pics d'inscriptions ou de connexions refusées.
5. **Chiffrement applicatif** des documents les plus sensibles (enveloppe AES-256-GCM, clés par compte dans un KMS), si un client l'exige.
6. **Trafic sortant du service de conversion** : le bloquer (machine Fly sans sortie, ou hébergement avec politique réseau).
7. **Révocation d'une session précise** et **alerte e-mail à chaque nouvelle connexion** sur un nouvel appareil.
8. **2FA obligatoire** pour les comptes d'équipe (option propriétaire d'équipe).
9. **Purge à 10 ans** du journal de preuve et du registre des paiements, à mettre en place avant 2036.

## 6. Ce qu'un audit externe doit vérifier

- Test d'intrusion de l'application : IDOR, élévation de privilèges, contournement de la 2FA, liens de signature, webhooks.
- Revue de la configuration Supabase de production : politiques, fonctions, stockage, Auth (durées de session, URL de redirection).
- Revue juridique : CGU, confidentialité, valeur probante selon les pays visés, contrats de sous-traitance (DPA) avec chaque prestataire.
- Revue du service de conversion face aux fichiers malveillants (fuzzing LibreOffice).
- Processus internes : gestion des accès, rotation des secrets, réponse à incident, notification de violation de données (72 h dans l'UE).

## 7. Signaler une vulnérabilité

Écrire à **supportquicksignapp@gmail.com**, objet « Sécurité ». Merci de ne pas divulguer publiquement avant notre réponse. Nous accusons réception sous 72 h.
