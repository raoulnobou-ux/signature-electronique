# Application Android (Google Play)

QuickSign est publié sur Google Play sous forme de **Trusted Web Activity** (TWA) : l'application Android ouvre le site en plein écran, sans barre d'adresse. Chaque mise à jour du site s'applique aussitôt dans l'application ; il ne faut publier une nouvelle version Android que pour changer l'icône, le nom, les couleurs ou les réglages Android. Décision : `DECISIONS.md`, D130.

## Modèle de paiement

L'application est un « compagnon » gratuit : on s'y connecte, on signe, on fait signer, on retrouve ses documents. **L'abonnement se paie sur le site** (Chariow), jamais dans l'application :

- Google Play Billing n'est pas utilisable depuis le Cameroun (pas de compte marchand Google pour ce pays) ;
- hors États-Unis, Royaume-Uni et EEE, Google n'autorise pas d'inviter à payer ailleurs dans l'application.

Dans l'application (`lib/store-app.ts`, repère `data-store="play"`), prix, choix de plan et liens vers le paiement sont masqués ; l'état de l'abonnement et les reçus restent visibles. Les clients sont invités à payer **hors de l'application** : e-mails automatiques (limite atteinte, rappels, échec) dont le lien `/payer` s'ouvre dans le navigateur, puisque l'application ne capture pas les liens.

## Fichiers

| Où                                  | Quoi                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `C:\dev\quicksign-android\`         | Projet Android généré (Bubblewrap), hors dépôt                                  |
| `C:\dev\quicksign-android\signing\` | **Clé d'envoi et son mot de passe : à sauvegarder hors du PC**, jamais dans Git |
| `C:\dev\quicksign-android\store\`   | Fiche Play Store (`FICHE-PLAY-STORE.md`), bannière, captures                    |
| `C:\dev\android-toolchain\`         | JDK 17, SDK Android, scripts `bw\build-twa.mjs` et `bw\store-assets.mjs`        |
| `android/` (ce dépôt)               | Copie de la configuration (`twa-manifest.json`) et des scripts, sans secret     |

Réglages de l'application : paquet `com.raoulnobou.quicksign` (**définitif après la première publication**), hôte `quicksign-six.vercel.app`, page de départ `/app?source=play`, aucune capture des liens (filtre d'intention `VIEW` retiré de `AndroidManifest.xml`).

## Compiler une nouvelle version

1. Augmenter `appVersionCode` (et `appVersionName`) dans `C:\dev\quicksign-android\twa-manifest.json` et `versionCode` / `versionName` dans `app\build.gradle`.
2. `node C:\dev\android-toolchain\bw\build-twa.mjs build`
3. Résultats : `app-release-signed.aab` (à envoyer sur Google Play) et `app-release-signed.apk` (test direct sur un téléphone).

## Vérification du domaine (assetlinks)

`https://quicksign-six.vercel.app/.well-known/assetlinks.json` est produit à partir des variables Vercel `ANDROID_PACKAGE_NAME` (défaut `com.raoulnobou.quicksign`) et `ANDROID_CERT_FINGERPRINTS` (empreintes SHA-256 séparées par des virgules).

- Empreinte de la **clé d'envoi** : déjà publiée (`signing\upload-key-sha256.txt`).
- Après le premier envoi sur Google Play : Play Console → **Test et publication → Intégrité de l'application → Signature d'application** → copier l'empreinte **SHA-256 du certificat de la clé de signature d'application**, et l'**ajouter** à `ANDROID_CERT_FINGERPRINTS` (après une virgule), puis redéployer. Sans elle, l'application installée depuis Google Play affiche une barre d'adresse.

## Publication (compte personnel)

1. **Compte** : https://play.google.com/console — compte développeur personnel (25 $), vérification d'identité.
2. **Créer l'application** : nom « QuickSign », langue par défaut français, type Application, gratuite.
3. **Test fermé** (obligatoire pour un compte personnel créé après le 13 novembre 2023) :
   - Test et publication → Tests → Test fermé → créer un canal ;
   - ajouter les **12 testeurs** (adresses Gmail) ;
   - envoyer `app-release-signed.aab`, publier sur le canal, partager le lien d'inscription ;
   - les testeurs installent l'application depuis Google Play et l'utilisent pendant **14 jours d'affilée** (si l'un se désinscrit et qu'on passe sous 12, le compteur repart à zéro).
4. **Fiche et contenu** : textes, images, sécurité des données et accès vérificateur dans `C:\dev\quicksign-android\store\FICHE-PLAY-STORE.md`.
5. **Production** : après les 14 jours, Tableau de bord → « Demander l'accès à la production », répondre aux questions sur le test, puis publier en production.

## Limites connues

- Pas de notifications push dans l'application (désactivées dans `twa-manifest.json`).
- Un nom de domaine personnalisé changerait l'hôte : nouvelle version Android, et `assetlinks.json` à servir aussi sur le nouveau domaine.
- Les règles Google Play évoluent : relire les règles sur les paiements avant chaque publication.
