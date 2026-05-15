# 🆕 Changelog

## v3.6 — Multilingual + tidy up

### Interface langue 🇫🇷 🇬🇧
- Interface entièrement traduite en **Français** et **Anglais**.
- Sélecteur de langue dans **⚙️ Paramètres** (en haut de la modale).
- Détection automatique de la langue système au premier lancement, sinon fallback en français.
- Persistance de la langue choisie dans le Store (clé `appLanguage`).
- Chips de filtres ("Tout" / "Non classé") et bouton "Choisir un fichier" maintenant traduits (l'input file natif est masqué et remplacé par un bouton stylé).

### Architecture i18n ouverte aux contributions
- Toutes les chaînes vivent dans `src/locales/*.json` — un fichier par langue.
- Vite détecte automatiquement chaque nouveau fichier via `import.meta.glob`. Pour ajouter une langue, un contributeur n'a qu'à déposer un JSON dans `src/locales/` — **aucune modification JS requise**.
- Si une clé manque dans une langue, l'app retombe silencieusement en anglais, donc les traductions partielles sont OK.
- Voir la section "Contributing translations" du README pour les détails.

### Nettoyage des noms
- Dossier projet renommé `ai-master-studio` (sans suffixe `-v35`), pour permettre les mises à jour par simple écrasement du dossier sans toucher aux données.
- Titre de la fenêtre simplifié en **"AI Master Studio"** (la version vit désormais en bas du panneau ⚙️ Paramètres).
- L'identifier interne Tauri reste `com.nicol.ai-master-studio-v35` pour préserver l'accès aux données existantes des utilisateurs de v3.5.

### Sous le capot
- Moteur `t(key, vars)` minimaliste avec interpolation (`{count}`, `{gpt}`, etc.).
- Système `data-i18n` / `data-i18n-attr` sur les éléments HTML pour le rendu déclaratif.
- Tous les `alert()` / `confirm()` du code passent désormais par `t()`.

---

## v3.5 — Vue grille, recherche avancée, lightbox zoom

### Studio Img

#### Lightbox amélioré (clic sur image)
- Cliquer sur une image en couverture ou dans une étape → ouvre en grand.
- **Molette** = zoom (de 25% à 800%).
- **Glisser** = déplacer l'image quand elle est zoomée.
- **Double-clic** = bascule entre 100% et 200%.
- Boutons `−` / `⟲` / `+` en haut + affichage du pourcentage.

#### Étapes : bascule Côte à côte / Slider
Quand une étape a une image **Avant** ET une image **Après** :
- Deux boutons apparaissent en haut de l'étape.
- **Côte à côte** (par défaut) : les deux images l'une à côté de l'autre.
- **Slider** : passer la souris sur l'image révèle progressivement l'Après par-dessus l'Avant (comparateur).

#### Drag & drop accéléré (modal nouvelle image)
- Lâcher un fichier **n'importe où** sur la fenêtre modale → il atterrit dans la 1ère zone vide.
- Lâcher 2 fichiers d'un coup → le premier va dans Avant, le second dans Après.
- Les zones Avant/Après individuelles continuent de marcher normalement.

#### Galerie plus compacte
- Le slider de zoom monte maintenant jusqu'à **8 colonnes** (vue planche-contact).

#### Recherche avancée
Le champ de recherche cherche maintenant dans :
- Titre de l'image
- Prompt principal
- Paramètres
- Nom du modèle IA
- Label et contenu de **chaque étape**

### Text GPTs

#### Bascule vue Liste / Grille
- Bouton **▦** dans la toolbar (à côté de la recherche).
- En mode grille : aperçu du prompt directement visible dans la carte.
- Slider à côté → de **1 à 6 colonnes**.
- Le mode et le nombre de colonnes sont sauvegardés.

#### Recherche avancée
Cherche maintenant dans : titre, tags, **prompt principal, notes, label et contenu de chaque étape**.

#### Création rapide de dossier
Dans le modal d'édition d'un prompt, à côté du sélecteur "Dossier" :
- Bouton **📂+** crée un nouveau dossier instantanément.
- Le dossier est automatiquement sélectionné.

#### Actions batch enrichies
Sélectionner plusieurs prompts avec **Ctrl/Cmd + clic**, puis :
- **Dossier** : déplacer la sélection dans un dossier (existait déjà).
- **Tags** ⭐ NOUVEAU : ajouter / retirer / remplacer les tags en masse.
- **Exporter** ⭐ NOUVEAU : sauvegarder la sélection en JSON partiel.
- **Supprimer** (existait déjà).

#### Import partiel
Bouton **📥** dans la toolbar des GPTs :
- Importe un JSON exporté avec le bouton "Exporter" ci-dessus.
- **Fusion** des données (n'écrase pas l'existant).
- Détecte les doublons d'ID et leur en attribue un nouveau.
- Fonctionne aussi pour les images.
