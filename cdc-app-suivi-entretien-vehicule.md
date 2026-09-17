# Cahier des charges — Application de suivi d'entretien véhicule

Document de cadrage destiné au développement via Claude Code. Objectif : application web mobile (PWA), usage personnel, suivi de l'entretien d'un ou plusieurs véhicules.

---

## 1. Exigences transverses

- **Responsive design**, priorité à l'affichage mobile portrait (le desktop/tablette doit rester utilisable mais n'est pas la cible principale).
- **Installation en PWA** : `manifest.json` + service worker, icône d'app, écran de démarrage, fonctionnement en mode "standalone" (sans barre d'adresse). Compatible "Ajouter à l'écran d'accueil" sur Safari iOS et "Installer l'application" sur Chrome Android.
- **Fonctionnement hors-ligne** : toutes les fonctionnalités de saisie/consultation doivent marcher sans réseau. Seule l'OCR assistée par IA (voir §5.3) nécessitera une connexion.
- **Stockage 100 % local** (IndexedDB), pas de compte utilisateur, pas de backend obligatoire pour les fonctions cœur.
- **Multi-véhicules dès le modèle de données** : même si l'interface démarre sur un seul véhicule, chaque entretien est rattaché à un `vehiculeId`. Coût nul aujourd'hui, coût élevé à ajouter plus tard.
- Interface en français, ton simple et direct (usage perso, pas de jargon).

---

## 2. Écran 1 — Paramétrage véhicule

Liste de véhicules (même si un seul au départ) + formulaire d'ajout/édition.

| Champ | Type | Notes |
|---|---|---|
| Type de véhicule | Liste déroulante | Voiture, Camion, Moto, Utilitaire, Autre |
| Marque | Texte | |
| Modèle | Texte | |
| Finition | Texte | ex : "Connect Edition" |
| Date de mise en circulation | Date | |
| Immatriculation | Texte libre | Ne pas imposer de regex stricte (formats SIV "AA-123-AA" et anciens formats coexistent, plus plaques WW) — juste un placeholder indicatif |
| Photo du véhicule | Capture caméra ou galerie | `<input type="file" accept="image/*" capture="environment">`, stockée en IndexedDB (blob), redimensionnée côté client avant stockage |

Actions : créer, modifier, supprimer un véhicule (avec confirmation si des entretiens y sont rattachés).

---

## 3. Écran 2 — Ajout et historique des entretiens

### 3.1 Formulaire de saisie

| Champ | Type | Notes |
|---|---|---|
| Véhicule concerné | Sélecteur | Pré-rempli si un seul véhicule |
| Date de l'entretien | Date | |
| Kilométrage | Nombre | |
| Type d'entretien | Liste déroulante + "Autre" | Vidange, Révision, Freins, Pneus, Distribution/courroie, Filtres, Contrôle technique, Batterie, Climatisation, Amortisseurs, Autre |
| Résumé court | Texte | ex : "bougies préchauffage" |
| Prix | Nombre (€) | |
| Nom du garage | Texte | |
| Photo de la facture | Capture caméra ou galerie | Stockée en pièce jointe de l'entretien, optionnelle |

### 3.2 Historique

Liste chronologique par véhicule, triable par date/km/prix, avec édition et suppression.

### 3.3 Lecture automatique de facture (OCR) — à arbitrer

Deux approches possibles, avec un compromis clair entre simplicité et fiabilité :

| | Option A — Tesseract.js (client, hors-ligne) | Option B — API de vision (ex. Claude API) via fonction serverless |
|---|---|---|
| Connexion requise | Non | Oui |
| Coût | Gratuit | Quelques centimes par facture |
| Fiabilité extraction (date, montant, garage, km) | Faible à moyenne : Tesseract lit le texte brut, il faut ensuite deviner quel nombre est le prix, quelle ligne est le garage — fragile sur des factures variées | Bonne : on peut demander un JSON structuré directement (date, montant, nom du garage, km si présent) |
| Complexité de mise en œuvre | Faible (lib JS via CDN) | Moyenne (nécessite une fonction Netlify qui reçoit l'image et interroge l'API, la clé ne doit jamais être exposée côté client) |

**Recommandation** : traiter l'OCR comme une fonctionnalité *assistante et optionnelle*, jamais bloquante. La saisie manuelle doit fonctionner intégralement sans elle (V1). L'OCR est ajoutée ensuite (V2), avec l'option B si une fiabilité correcte est souhaitée — dans tous les cas, les champs pré-remplis restent modifiables avant validation, jamais enregistrés automatiquement sans relecture.

---

## 4. Écran 3 — Export

- Filtres : type d'entretien, texte libre (recherche dans résumé/garage), date début/fin.
- Génération d'un **PDF** récapitulatif des entretiens filtrés (tableau : date, km, type, résumé, prix, garage) — via `jsPDF` + `jspdf-autotable`, entièrement côté client.
- Envoi par mail : un navigateur ne peut pas envoyer un mail avec pièce jointe directement. Deux options concrètes :
  - **Web Share API** (`navigator.share` avec fichier) : ouvre le menu de partage natif iOS/Android, l'utilisateur choisit "Mail" et la pièce jointe est déjà attachée. Fonctionne bien sur Safari iOS récent.
  - **Repli** : téléchargement du PDF, l'utilisateur l'attache lui-même dans son app mail.
  - Recommandation : proposer le partage natif en priorité, avec le téléchargement en solution de secours si `navigator.share` avec fichiers n'est pas supporté.

---

## 5. Modèle de données (IndexedDB)

```json
// Véhicule
{
  "id": "uuid",
  "type": "voiture | camion | moto | utilitaire | autre",
  "marque": "string",
  "modele": "string",
  "finition": "string",
  "dateMiseEnCirculation": "YYYY-MM-DD",
  "immatriculation": "string",
  "photoBlobId": "reference vers un blob IndexedDB",
  "dateCreation": "ISO 8601"
}

// Entretien
{
  "id": "uuid",
  "vehiculeId": "uuid",
  "dateEntretien": "YYYY-MM-DD",
  "kilometrage": "number",
  "typeEntretien": "string",
  "resume": "string",
  "prix": "number",
  "nomGarage": "string",
  "photoFactureBlobId": "reference vers un blob IndexedDB (optionnel)",
  "dateCreation": "ISO 8601"
}
```

---

## 6. Stack technique proposée

- **Frontend** : HTML/CSS/JS simple (ou petit framework léger type Vite + vanilla JS) — pas besoin de React pour ce périmètre.
- **Stockage** : IndexedDB (via une petite lib type `idb` pour simplifier l'API).
- **PDF** : `jsPDF` + `jspdf-autotable` (CDN).
- **PWA** : `manifest.json`, service worker (cache des assets statiques, stratégie "cache first").
- **OCR (V2)** : fonction serverless Netlify comme proxy vers l'API de vision, clé API côté serveur uniquement.
- **Déploiement** : Netlify (cohérent avec vos projets précédents), en repo Git cette fois plutôt qu'un simple drop, pour permettre les itérations via Claude Code.

---

## 7. Plan de développement par phases

- [ ] **Phase 0** — Squelette du projet, manifest PWA, icônes, service worker minimal
- [ ] **Phase 1** — Écran véhicule (CRUD complet + photo)
- [ ] **Phase 2** — Écran entretien (CRUD, historique, saisie 100 % manuelle)
- [ ] **Phase 3** — Écran export (filtres, génération PDF, partage)
- [ ] **Phase 4** — PWA installable, test hors-ligne complet, tests responsive (mobile/tablette)
- [ ] **Phase 5 (optionnelle)** — OCR facture assistée
- [ ] **Phase 6 (optionnelle)** — améliorations (voir §8)

---

## 8. Propositions d'amélioration (optionnelles, non bloquantes pour V1)

- **Sélecteur multi-véhicules** dans la barre de navigation, une fois plus d'un véhicule enregistré.
- **Rappels d'entretien** : alerte quand le prochain entretien approche (par date ou kilométrage estimé).
- **Tableau de bord** : coût total par véhicule, coût au km, graphique de dépenses par an/type.
- **Sauvegarde/restauration** : export/import d'un fichier JSON complet — important car les données sont uniquement locales, un changement de téléphone ou un cache vidé les efface sinon.
- **Mode sombre automatique** (cohérent avec votre app BlaBlaCar précédente).
- **Champs additionnels** : date du prochain contrôle technique, échéance d'assurance.

---

## 9. Points de vigilance

- Le stockage étant local, **pas de sauvegarde automatique dans le cloud** — la fonctionnalité d'export/import JSON (§8) n'est donc pas juste un "plus", elle protège contre la perte de données.
- L'OCR ne doit jamais enregistrer sans relecture par l'utilisateur.
- Le partage par mail avec pièce jointe dépend du support de `navigator.share({files})` par le navigateur — prévoir le repli "téléchargement" dans tous les cas.

---

## 10. Prompt de démarrage suggéré pour Claude Code

> Voici un cahier des charges (ci-joint) pour une PWA de suivi d'entretien véhicule. Démarre par les Phases 0 à 3 (squelette PWA, écran véhicule, écran entretien en saisie manuelle, écran export avec PDF) en HTML/CSS/JS simple avec IndexedDB pour le stockage. Ne touche pas encore à l'OCR (Phase 5) ni aux améliorations (Phase 6). Structure le code en plusieurs fichiers clairs plutôt qu'un fichier unique, avec un repo Git prêt à déployer sur Netlify.
