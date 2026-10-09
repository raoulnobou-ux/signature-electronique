# Langues, pays, devises et formats

QuickSign s'adapte à chaque utilisateur selon trois réglages du profil, tous modifiables dans **Paramètres → Profil** :

| Réglage           | Colonne                                    | Rempli à l'inscription par                                                        | Sert à                                                            |
| ----------------- | ------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Langue            | `profiles.locale`                          | la langue de la page d'inscription                                                | interface, e-mails, reçus, assistant, libellés des tampons        |
| Pays de résidence | `profiles.country` (ISO alpha-2)           | le pays détecté (`x-vercel-ip-country`), modifiable avec l'indicatif du téléphone | moyens de paiement proposés, devise par défaut, pays Mobile Money |
| Fuseau horaire    | `profiles.timezone` (IANA)                 | le fuseau de l'appareil (`Intl`)                                                  | dates des signatures, des e-mails, des reçus et des certificats   |
| Devise préférée   | `profiles.currency` (ISO 4217, facultatif) | — (vide = selon le pays)                                                          | prix affichés et devise de paiement par défaut                    |

Le téléphone est **facultatif** et international (`libphonenumber-js`, normalisé en E.164). Le pays du visiteur passe en tête de la liste des indicatifs.

Comptes créés avec Google :

- le pays détecté est enregistré au premier retour de connexion ;
- un compte encore en UTC reçoit une fois le fuseau de son appareil (`TimezoneSync`).

## Formats de date

`formatLongDate(date, langue, fuseau)` (`lib/format.ts`) et `formatSignatureDate` (`lib/pdf/fields.ts`) produisent par exemple :

- « 5 octobre 2026 » en français ;
- « 5 October 2026 » en anglais.

La date est toujours calculée dans le fuseau de l'utilisateur, jamais dans celui du serveur. Dans l'interface, `useFormatter()` (next-intl) applique la langue courante.

## Ajouter une langue

1. `i18n/config.ts` : ajouter le code dans `locales` (ex. `"es"`).
2. `messages/es.json` : copier `messages/en.json` et traduire. Les clés doivent être identiques ; TypeScript vérifie les clés utilisées dans le code.
3. `components/locale-switcher.tsx` : ajouter le nom dans `LOCALE_NAMES`.
4. Base : une migration élargit la contrainte `profiles_locale_check` (aujourd'hui `fr`, `en`).
5. Textes hors fichiers de messages, qui ont tous une branche « fr » et une branche « en » :
   - e-mails : `lib/email/templates.ts` ;
   - reçus : `RECEIPT_TEXT` dans `lib/billing/receipt.ts` ;
   - tampons : `STATUS_LABELS` dans `lib/images/stamp.ts` ;
   - mentions : `mentionsFor` dans `lib/pdf/fields.ts` ;
   - modèles d'e-mails Supabase : `supabase/templates/*.html`, avec `.Data.locale`.
6. Formats : `formatLongDate` et `formatSignatureDate` choisissent la région d'affichage (`fr-FR`, `en-GB`). Ajouter la nouvelle langue à ce choix.

## Ajouter une devise

Voir [`docs/PAIEMENTS.md`](PAIEMENTS.md#ajouter-une-devise) : `config/currencies.ts`, les prix dans `plans_config`, et un prestataire qui l'accepte.

## Ajouter un pays ou changer sa devise par défaut

- `config/markets.ts` : zone franc CFA, zone euro, et la devise par défaut d'un pays (dollar sinon).
- Mobile Money : `lib/billing/cfa.ts` (pays, devise, indicatif) ; les opérateurs proposés se règlent sur le compte Notch Pay.
- Pays en tête de la liste des indicatifs : `FAVORITES` dans `lib/phone.ts`.
