# Signature Électronique

Signez vos documents directement à l'écran : plus besoin d'imprimer, signer à la main, scanner puis réimprimer.

1. **Ouvrir** un document (PDF, JPG ou PNG).
2. **Créer sa signature** : la dessiner à la souris ou au doigt, taper son nom dans un style manuscrit, ou importer une photo de sa signature ou du **cachet** de la structure (le fond blanc est rendu transparent).
3. **La placer** sur la page : déplacer, agrandir, ajouter la date du jour, copier la signature sur toutes les pages (paraphe).
4. **Télécharger** le PDF signé ou l'**imprimer** directement.

Les signatures sont enregistrées dans le navigateur et réutilisables pour les documents suivants.

## Confidentialité

Tout se passe dans le navigateur : aucun document n'est envoyé sur un serveur. L'application fonctionne sans connexion internet (bibliothèques et polices incluses dans le dépôt).

## Lancer l'application

C'est un site statique, sans installation :

```bash
npx http-server .     # ou : python3 -m http.server
```

puis ouvrir http://localhost:8080. On peut aussi l'héberger gratuitement avec GitHub Pages.

## Formats

- **PDF** : pris en charge, y compris les pages tournées et les documents de plusieurs pages.
- **Images** (JPG, PNG) : converties en PDF à l'ouverture.
- **Word** (.docx) : pas encore pris en charge directement. En attendant, dans Word : *Fichier → Enregistrer sous → PDF*.
- Les PDF protégés par mot de passe ne peuvent pas être signés.

## Valeur juridique

Cette application appose une **signature électronique simple** (image de la signature sur le document). C'est suffisant pour de nombreux usages internes (annonces, notes, courriers). Pour des actes qui exigent une signature électronique **avancée ou qualifiée** (certificat numérique, horodatage, vérification d'identité), il faudra ajouter une signature cryptographique : c'est une piste d'évolution.

## Technique

- [pdf.js](https://mozilla.github.io/pdf.js/) pour afficher les documents (`vendor/pdf.min.js`)
- [pdf-lib](https://pdf-lib.js.org/) pour produire le PDF signé (`vendor/pdf-lib.min.js`)
- Polices Great Vibes et Dancing Script (licence OFL) dans `fonts/`

Code de l'application : `index.html`, `css/style.css`, `js/app.js`.
