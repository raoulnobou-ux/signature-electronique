# Paiements, plans et devises

Ce guide sert à faire évoluer les paiements de QuickSign sans casser l'existant. Les choix sont justifiés dans `DECISIONS.md` (D95, D97, D108 à D111, D123).

## Architecture

```
lib/billing/
  providers/
    types.ts            interface PaymentProvider, PaymentMethod, PaymentOption
    african/notchpay.ts Notch Pay : page hébergée, en FCFA (canaux lus chez Notch Pay)
    card/chariow.ts     Chariow : carte et autres moyens, produits Licence à prix fixes (FCFA)
    sandbox.ts          paiement simulé (développement, tests e2e)
  index.ts              registre : prestataires activés, moyen par devise, options par pays
  webhook.ts            traitement commun des notifications (signature, revérification, idempotence)
  failure.ts            cause d'un échec traduite pour le client (jamais le code brut)
  quote.ts              devis exact (plein tarif, renouvellement, prorata), arrondis par devise
config/currencies.ts    devises acceptées (décimales, montant minimal, arrondi, symbole)
config/markets.ts       devise par défaut d'un pays, zone franc CFA
```

Le parcours d'un paiement :

1. Le récapitulatif affiche les moyens de paiement du pays du visiteur (`paymentOptions(pays)`) et les canaux réellement ouverts chez le prestataire (`paymentChannels()`).
2. `startCheckout` (limité par compte et par adresse IP) calcule le prix côté serveur, enregistre un paiement `pending` et demande au prestataire l'URL de paiement.
3. Le client paie sur la page hébergée, puis revient sur `/app/abonnement/paiement?ref=<référence>`. Cette page n'active rien : elle interroge `checkPayment` toutes les 5 s pendant 3 minutes, qui relit notre base et, si le paiement est encore en attente, le fait revérifier par le serveur auprès du prestataire.
4. Le prestataire notifie `/api/webhooks/<nom>` (source de vérité). La notification n'est jamais crue telle quelle : signature vérifiée, puis transaction relue par l'API du prestataire (`verifyTransaction`) avant `complete_payment`.
5. `complete_payment` (SQL) est idempotent : une notification en double ne prolonge pas l'abonnement deux fois. Le premier arrivé (notification ou revérification de la page) active, l'autre ne fait rien.

Contrôles avant activation (`settlePayment`) : statut `complete` chez Notch Pay, transaction portant notre référence (`merchant_reference`), montant au moins égal au prix enregistré, même devise, pas de transaction de test avec une clé de production.

## Activer ou désactiver un prestataire

`PAYMENT_PROVIDERS` (Vercel → Settings → Environment Variables), par exemple `notchpay`.

- Vide : tous les prestataires dont les clés sont renseignées sont actifs.
- Un nom absent de la liste : ce prestataire disparaît du site, sans modifier le code.

Redéployer après le changement.

## Ajouter un prestataire

1. Créer `lib/billing/providers/<famille>/<nom>.ts`, qui implémente `PaymentProvider` :
   - `name`, `method` (`card` ou `mobile_money`) et `currencies` ;
   - `supportsCountry?` ;
   - `createCheckout`, `verifyTransaction`, `parseWebhook` ;
   - `cancelSubscription?` et `refund?`, facultatifs.
2. Ajouter ses variables dans `lib/env.server.ts` et `.env.example`.
3. L'enregistrer dans `lib/billing/index.ts` :
   - une fonction `getXxx()` protégée par `providerEnabled("xxx")` ;
   - l'ajouter à `realProviders()` et à `providerByName()`.
4. Créer la route `app/api/webhooks/<nom>/route.ts` en appelant `handlePaymentWebhook` (voir les routes existantes).
5. Ajouter des tests dans `tests/unit/billing.test.ts` (signature des notifications, correspondance des statuts) et `tests/unit/payment-registry.test.ts`.

L'ordre de `realProviders()` décide quel prestataire est choisi quand deux acceptent la même devise.

## Modifier les prix

Les prix vivent dans la table `plans_config` (une ligne par plan et par devise). On les modifie dans Supabase → Table Editor, sans redéployer : ils sont relus toutes les 5 minutes.

Prix par marché, sans conversion automatique :

| Plan      | FCFA (XAF)       | Euro     | Dollar   | Livre    |
| --------- | ---------------- | -------- | -------- | -------- |
| Essentiel | 5 000 / 50 000   | 9 / 90   | 10 / 100 | 8 / 80   |
| Pro       | 15 000 / 150 000 | 25 / 250 | 29 / 290 | 22 / 220 |

(mensuel / annuel). `DEFAULT_PRICES` (`lib/entitlements/plans.ts`) ne sert qu'en secours, si la base est injoignable : garder les mêmes valeurs.

## Ajouter une devise

1. `config/currencies.ts` : ajouter le code ISO 4217 avec ses décimales, le montant minimal, le pas d'arrondi et l'affichage du symbole.
2. `lib/entitlements/plans.ts` : prix de secours dans `DEFAULT_PRICES`.
3. `plans_config` : une ligne par plan dans cette devise. La base accepte déjà tout code à trois lettres.
4. Ajouter la devise dans le champ `currencies` d'un prestataire qui l'accepte (sinon elle s'affiche sur la page Tarifs mais ne peut pas être payée).
5. Facultatif : `config/markets.ts`, pour que les pays concernés la voient par défaut.

## Pays et moyens proposés par Notch Pay

Le client ne choisit pas de pays sur QuickSign : la page Notch Pay affiche elle-même les moyens activés sur le compte.

QuickSign n'écrit aucun canal en dur. `NotchPayProvider.listChannels()` lit `GET /channels?currency=XAF` (cache de 10 minutes, délai de 4 s) et ne garde que les canaux `active` et, avec une clé de production, `live`. Les pages Tarifs et Abonnement affichent ces noms ; si Notch Pay ne répond pas, un texte générique les remplace ; si aucun canal n'est ouvert, le paiement est indisponible.

Pour proposer la carte bancaire ou d'autres opérateurs : les faire activer sur le compte Notch Pay. Ils apparaissent alors d'eux-mêmes, sans redéployer (dans les 10 minutes).

Canaux ouverts au 13 octobre 2026 (clé de production) : MTN Mobile Money (`cm.mtn`) et Orange Money (`cm.orange`). Carte bancaire, PayPal, EU Mobile Money et Yoomee : inactifs.

## Notifications Notch Pay (webhook)

- URL : `https://<domaine>/api/webhooks/notchpay`, à déclarer dans Notch Pay → Paramètres → Webhooks, avec les événements de paiement.
- `NOTCHPAY_WEBHOOK_SECRET` (clé de hachage du webhook, « Hash Key ») est **obligatoire** : sans elle, toute notification est refusée (401). Le retour du client et la tâche planifiée continuent alors de régler les paiements, avec du retard.
- Signature : HMAC-SHA256 du **corps brut** avec la clé de hachage, en-tête `x-notch-signature`, comparaison en temps constant. Attention : l'exemple Node de la documentation Notch Pay recalcule le corps avec `JSON.stringify(req.body)`, ce qui casse la signature.
- Traités : `payment.complete`, `payment.failed`, `payment.canceled`, `payment.expired`, `payment.abandoned`. Les autres (dont `payment.created`, transferts, clients) sont notés dans `payment_events` puis ignorés.
- Corps limité à 64 Ko ; seule la méthode POST est acceptée.

## Écarts relevés entre la documentation Notch Pay et l'API (13 octobre 2026)

| Documentation                                       | API réelle                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /resources/channels`, liste `channels`         | `GET /channels`, liste `items`                                                                                                          |
| `GET /payments/{reference}` accepte notre référence | 404 avec notre référence : seule la référence Notch Pay (`trx.…`) fonctionne. Elle est notée à la création (`payments.provider_tx_id`). |
| Événements lus dans `event.type`                    | Le champ s'appelle `event` (les deux sont lus)                                                                                          |
| Signature calculée sur `JSON.stringify(req.body)`   | À calculer sur le corps brut                                                                                                            |
| 6 statuts (Payments API)                            | Aussi `abandoned`, `incomplete`, `refunded`, `partialy-refunded` (page « Collect »)                                                     |
| —                                                   | La liste des paiements avec une clé de production inclut aussi les paiements de test                                                    |

## Chariow (carte bancaire et autres moyens)

Chariow encaisse pour le compte de QuickSign (carte bancaire et moyens proposés dans le pays de l'acheteur), puis reverse les fonds au vendeur moins sa commission. Fichier : `lib/billing/providers/card/chariow.ts` ; notifications : `/api/webhooks/chariow`. Documentation officielle : https://chariow.dev (lue le 14 octobre 2026).

### Fonctionnement

1. Le client choisit « Carte bancaire et autres moyens » dans le récapitulatif.
2. Le serveur relit le prix du produit Chariow (`GET /v1/products/{id}`) : s'il diffère du prix QuickSign (`plans_config`), aucun paiement n'est créé (erreur `config` dans `app_errors`). Un client ne peut donc jamais payer un montant que la vérification refuserait ensuite.
3. Le serveur crée la vente (`POST /v1/checkout`) avec notre référence dans `custom_metadata.qs_ref`, l'adresse de retour `/app/abonnement/paiement` et l'adresse IP de l'acheteur (moyens proposés selon son pays). L'identifiant de vente (`sal_…`) est noté dans `payments.provider_tx_id`.
4. Le client paie sur la page Chariow, puis revient sur la page d'état, qui fait revérifier la vente (`GET /v1/sales/{id}`).
5. Chariow notifie `successful.sale` ou `failed.sale` : signature vérifiée, vente relue, puis `complete_payment`.

### Limites

- **Prix fixes** : pas de montant calculé, donc pas de passage au Pro au prorata par carte (proposé par Mobile Money) ; un passage au Pro par carte se fait à la fin de la période.
- **Numéro de téléphone obligatoire** pour Chariow : sans numéro valide dans le profil, le client est invité à l'ajouter (Paramètres → Profil).
- **Paiement en FCFA** : produits en FCFA, l'acheteur étranger paie ce montant par carte.
- **Pas de mode test** connu chez Chariow : tout paiement par Chariow est réel.
- Une vente `failed` ou `abandoned` peut être rouverte puis réussir chez Chariow : la notification `successful.sale` active alors l'abonnement (`complete_payment` accepte un paiement noté en échec).

### Mise en place (une fois)

1. **Produits** : Chariow → Produits → Nouveau produit, **type « Licence »** (le seul qui se rachète : les autres types refusent un deuxième achat avec `already_purchased`). Quatre produits, prix en **FCFA**, identiques à `plans_config` :

   | Produit                      | Prix         |
   | ---------------------------- | ------------ |
   | QuickSign Essentiel — 1 mois | 5 000 FCFA   |
   | QuickSign Essentiel — 1 an   | 50 000 FCFA  |
   | QuickSign Pro — 1 mois       | 15 000 FCFA  |
   | QuickSign Pro — 1 an         | 150 000 FCFA |

   Tarification « paiement unique » (pas de prix libre), licences générées automatiquement, publier chaque produit, puis noter son identifiant (`prd_…`).

2. **Clé API** : Chariow → Paramètres → Clés API → Créer une clé, scopes `checkout.write`, `sales.read`, `products.read`.
3. **Pulse** : Chariow → Automatisations → Pulses → nouvelle Pulse vers `https://<domaine>/api/webhooks/chariow`, événements `successful.sale` et `failed.sale` (tous les produits), puis copier le **Signing secret** (`whsec_…`).
4. **Vercel** → Settings → Environment Variables (Production) : `CHARIOW_API_KEY`, `CHARIOW_PULSE_SECRET`, `CHARIOW_PRODUCT_ESSENTIAL_MONTHLY`, `CHARIOW_PRODUCT_ESSENTIAL_YEARLY`, `CHARIOW_PRODUCT_PRO_MONTHLY`, `CHARIOW_PRODUCT_PRO_YEARLY`, puis redéployer.
5. Vérifier : le récapitulatif propose « Carte bancaire et autres moyens » ; dans Chariow, onglet **Deliveries** de la Pulse, envoyer un test : QuickSign répond `200`.

**Changer un prix** : modifier la même valeur dans `plans_config` **et** dans le produit Chariow. Tant qu'ils diffèrent, le paiement par carte de ce plan est refusé avant tout débit.

**Après 5 notifications sans réponse 2xx, Chariow désactive la Pulse** et prévient par e-mail : la réactiver dans le tableau de bord, puis rejouer les livraisons manquées (onglet Deliveries). En attendant, la page d'état et la tâche planifiée revérifient les paiements en attente.

## Diagnostic d'un paiement refusé

`npm run notchpay:inspect -- trx.xxxxxxxx` affiche la réponse complète de Notch Pay (données personnelles masquées ; clé lue dans `.env.local`). La cause d'un refus n'est pas toujours transmise par Notch Pay : dans ce cas, s'adresser à son support avec la référence `trx.…`.

## Prestataires retirés

pawaPay et Paddle ont été retirés le 9 octobre 2026 (D123). Les paiements déjà enregistrés gardent leur nom de prestataire dans `payments.provider` et leurs reçus ; ils ne sont simplement plus revérifiés. Pour réintroduire un prestataire, suivre « Ajouter un prestataire » : l'historique Git contient les anciennes implémentations.

## Accès avant paiement

Parcours : inscription → e-mail vérifié → accueil → **accès gratuit** → choix d'un plan → paiement → accès complet.

|                                                     | Accès gratuit     | Essentiel | Pro            |
| --------------------------------------------------- | ----------------- | --------- | -------------- |
| Tableau de bord, profil                             | oui               | oui       | oui            |
| Documents importés                                  | 1                 | illimité  | illimité       |
| Éditeur (placer, créer sa signature)                | oui (1 signature) | oui (5)   | oui (illimité) |
| Signature finale, export du PDF signé               | non               | 50 / mois | illimité       |
| Assistant                                           | 5 / jour          | 20 / jour | illimité       |
| Cachets, demandes à plusieurs, modèles, lot, équipe | non               | non       | oui            |

Les droits sont calculés par `getEntitlements` (`lib/entitlements/index.ts`) et vérifiés côté serveur par `guard(fonction, quota)` avant chaque action. L'interface ne fait qu'afficher ce que le serveur autorise.

## Modifier les limites

Supabase → Table Editor → `plans_config`, colonne `limits` (JSON) :

- ligne `free` / `XAF` : l'accès gratuit ;
- lignes `essential` / `XAF` et `pro` / `XAF` : les plans payants.

| Clé                 | Signification                                                         |
| ------------------- | --------------------------------------------------------------------- |
| `documentsStored`   | documents conservés hors corbeille (`null` = illimité)                |
| `documentsPerMonth` | documents signés par mois (`null` = illimité, `0` = signature fermée) |
| `signatureAssets`   | signatures et paraphes en bibliothèque                                |
| `aiMessagesPerDay`  | messages à l'assistant par jour                                       |
| `storageBytes`      | espace de stockage, en octets                                         |
| `teamMembers`       | places dans l'équipe                                                  |

Les changements s'appliquent à la requête suivante, sans redéploiement. La page Tarifs (cartes et comparatif) affiche ces mêmes valeurs, relues toutes les 5 minutes. Les valeurs de repli (`DEFAULT_LIMITS`, `FREE_LIMITS`) ne servent que si la base est injoignable.
