# Paiements, plans et devises

Ce guide sert à faire évoluer les paiements de QuickSign sans casser l'existant. Les choix sont justifiés dans `DECISIONS.md` (D95, D97, D108 à D111, D123).

## Architecture

```
lib/billing/
  providers/
    types.ts            interface PaymentProvider, PaymentMethod, PaymentOption
    african/notchpay.ts Notch Pay : Mobile Money (MTN, Orange) et carte, en FCFA
    sandbox.ts          paiement simulé (développement, tests e2e)
  index.ts              registre : prestataires activés, moyen par devise, options par pays
  webhook.ts            traitement commun des notifications (signature, revérification, idempotence)
  quote.ts              devis exact (plein tarif, renouvellement, prorata), arrondis par devise
config/currencies.ts    devises acceptées (décimales, montant minimal, arrondi, symbole)
config/markets.ts       devise par défaut d'un pays, zone franc CFA
```

Le parcours d'un paiement :

1. Le récapitulatif affiche les moyens de paiement du pays du visiteur (`paymentOptions(pays)`).
2. `startCheckout` enregistre un paiement `pending` et demande au prestataire l'URL de paiement.
3. Le prestataire notifie `/api/webhooks/<nom>`. La notification n'est jamais crue telle quelle : la transaction est relue par l'API du prestataire (`verifyTransaction`) avant `complete_payment`.
4. `complete_payment` (SQL) est idempotent : une notification en double ne prolonge pas l'abonnement deux fois.

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

Le client ne choisit pas de pays sur QuickSign : la page Notch Pay affiche elle-même les moyens disponibles (Mobile Money selon le pays, carte bancaire partout). Pour proposer d'autres pays ou opérateurs, les activer sur le compte Notch Pay.

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
