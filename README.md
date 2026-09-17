# Suivi Entretien Véhicule

PWA hors-ligne de suivi d'entretien véhicule (usage personnel). Stockage 100 % local (IndexedDB), aucun compte, aucun backend requis.

Cahier des charges complet : [cdc-app-suivi-entretien-vehicule.md](cdc-app-suivi-entretien-vehicule.md).

## Fonctionnalités (Phases 0 à 3)

- Gestion des véhicules (CRUD + photo)
- Gestion des entretiens (CRUD, historique triable, photo de facture)
- Export PDF filtré (type, texte, dates) avec partage natif (`navigator.share`) ou téléchargement
- Installable en PWA (manifest + service worker, fonctionne hors-ligne après le premier chargement)

Non traité dans cette version : OCR de facture (Phase 5) et améliorations optionnelles (Phase 6, voir le cahier des charges §8).

## Lancer en local

L'app utilise des modules ES (`<script type="module">`), qui nécessitent un serveur HTTP (pas d'ouverture directe du fichier `index.html`).

```bash
python -m http.server 8420
```

Puis ouvrir `http://localhost:8420`.

## Déploiement Netlify

Aucune configuration de build nécessaire : c'est un site statique, publier le dossier racine tel quel (`index.html` à la racine).

## Notes

- Les icônes dans `icons/` sont des placeholders générés automatiquement (silhouette de voiture) — à remplacer par une vraie identité visuelle si besoin.
- Les bibliothèques `jsPDF` / `jspdf-autotable` sont chargées via CDN (jsDelivr) et mises en cache par le service worker pour fonctionner hors-ligne après le premier chargement.
