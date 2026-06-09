# 🆕 Changelog

## v3.6.1 — Post-roadmap : nettoyage IA, corbeille GPT et navigation

### Nettoyage IA local
- Nouveau bouton **✦ Nettoyer** configurable dans les paramètres.
- Nettoyage disponible dans la modale GPT pour le **prompt principal** et la **note**.
- Nettoyage disponible dans les modales d'étapes GPT texte et Studio Img pour les **sous-prompts**.
- Nouveau bouton Splitter **✦ Nettoyer** pour corriger et remettre en forme le texte collé avant découpage.
- Nouveau bulk **✦ Nettoyer le fil** : nettoie le prompt principal et tous les sous-prompts des GPTs sélectionnés.
- Clic droit sur une carte GPT : actions **✦ Nettoyer le prompt** et **✦ Nettoyer le fil**.
- Le nettoyage supprime mieux les retours à la ligne peu harmonieux, regroupe les phrases orphelines en paragraphes, retire les lignes vides entre items de listes et indente les sous-listes.
- Robustesse LM Studio : les réponses JSON, JSON tronquées, blocs Markdown ou texte brut sont mieux interprétés.
- Protection anti-écrasement : si LM Studio renvoie l'écho de la consigne de nettoyage au lieu du résultat, l'app refuse la réponse et n'écrase plus la carte.

### Auto-nommage IA des étapes
- Nouvelle option **Auto-nommer les étapes vides via IA** dans les paramètres.
- Sauvegarde d'étape non bloquante : l'étape est enregistrée immédiatement, puis le titre IA arrive en arrière-plan si l'option est activée.
- Clic droit sur une étape : **Renommer** en édition inline et **🔮 Nommer via IA**.
- Vue détail GPT : bouton **🔮 Nommer toutes les étapes**, visible quand des labels sont vides ou génériques.
- Clic droit sur une carte GPT : **🔮 Nommer les étapes vides** en arrière-plan.
- Import partiel : option **🔮 Auto-nommer** pour nommer automatiquement les étapes sans titre après import.

### Recherche et navigation
- Nouveau finder local **Ctrl+F** dans Text GPTs et Studio Img : surligne les cartes, affiche un compteur et navigue avec Entrée / Shift+Entrée / flèches.
- Navigation clavier dans la liste GPT avec **↑ / ↓**, ouverture avec Entrée.
- **Ctrl+D** duplique l'élément sélectionné.
- **Ctrl+E** édite l'élément focusé ou sélectionné depuis la liste.
- Presets personnalisés du Splitter disponibles dans la palette **Ctrl+K**.
- La modale d'aide documente les raccourcis ajoutés.

### Text GPTs
- Nouvelle **corbeille GPT texte** : chip visible quand des GPTs supprimés existent.
- En corbeille : boutons **Restaurer** et **Supprimer définitivement** sur chaque carte.
- Paramètres : bouton **Vider la corbeille GPT**.
- Badges `+N` sur les cartes GPT pour afficher le nombre d'étapes.
- États vides enrichis selon le contexte : bibliothèque vide, dossier vide, recherche sans résultat, corbeille vide.
- Les prompts et sous-prompts en vue détail s'affichent maintenant en entier : plus de scroll interne dans les blocs de prompt.

### Cohérence UI / i18n
- Options **(Aucun)** des sélecteurs GPT / Image traduites via i18n.
- Chunks du Splitter entièrement internationalisés.
- Remplacement des dernières boîtes natives `confirm()` / `prompt()` par les modales custom.
- Mini-modale custom pour créer rapidement un dossier depuis la modale GPT.
- Feedback visuel `.processing` pendant les traitements IA bulk et les traitements d'étapes.

## v3.6.0 — Mise à jour actuelle : IA locale, UX et Studio Img

### Correctifs UX post-roadmap
- Correction des états vides : le texte **Vide** passe maintenant par l'i18n (`common.empty`) dans les GPTs et Studio Img.
- La barre bulk affiche maintenant **Dossier** ou **Catégorie** selon le type de sélection.
- Focus automatique du premier champ utile à l'ouverture des modales GPT, Image, Dossier, Étape et déplacement d'étape.
- Remplacement du `prompt()` natif pour déplacer une étape vers un autre GPT par une modale avec liste déroulante.
- Menus contextuels enrichis : copier le prompt, déplacer vers un dossier / une catégorie, ajouter un tag, dupliquer ou supprimer.
- Clic droit sur une zone vide de bibliothèque / galerie pour créer rapidement un GPT ou une image.
- Navigation clavier dans la palette `Ctrl+K` avec flèches haut / bas et validation de l'item actif.
- Raccourcis en vue détail : `E` pour éditer, `N` ou `+` pour ajouter une étape, `←` / `Backspace` pour revenir.
- `Ctrl+C` sur une carte GPT sélectionnée copie le prompt principal et incrémente le compteur d'utilisation.
- `Ctrl+Enter` dans le Splitter lance le découpage.
- Navigation `←` / `→` dans la lightbox pour parcourir les images visibles.

### Confort et polish
- Toast discret **Sauvegardé** après les enregistrements principaux.
- Compteur de caractères en direct sous le Splitter avec estimation du nombre de parties et barre d'alerte.
- Autocomplétion légère des tags dans les modales GPT et Image à partir des tags déjà utilisés.
- Compteurs d'items dans les chips de dossiers, catégories et modèles.
- Poignée de drag-and-drop des étapes plus visible au survol.

### IA locale
- Connexion configurable à **LM Studio** ou **Ollama** depuis les paramètres.
- Détection des modèles locaux disponibles, sélection du modèle actif, et actions de chargement / déchargement quand le fournisseur le permet.
- Génération locale utilisée pour suggérer des tags, générer une note courte, proposer un titre, améliorer un prompt et enrichir les images.
- Correction de compatibilité LM Studio : les requêtes de chat n'envoient plus de champ non supporté qui provoquait un `400 Bad Request`.

### Text GPTs
- Tags cliquables : un clic sur un tag applique immédiatement le filtre correspondant.
- Compteur d'utilisation : copier un prompt incrémente son compteur, avec tri **Plus utilisés**.
- Renommage direct des dossiers.
- Recherche configurable : mode **Avancée** (titre, tags, prompt, note, étapes) ou **Titre seul**.
- `Échap` vide la recherche active et réaffiche toute la bibliothèque.
- Détection de doublons pendant la saisie.
- Suggestion automatique de dossier à la création.
- Résumé automatique de la note si elle est vide.
- Bouton d'amélioration de prompt via IA locale avec aperçu avant / après.
- Palette de commandes `Ctrl+K`.
- Raccourcis clavier en modales : `Ctrl+Enter` pour sauvegarder, `Échap` pour fermer.
- Double-clic sur les zones principales pour ouvrir l'édition.
- Menu contextuel sur les étapes : copier, dupliquer, déplacer ou supprimer.

### Studio Img
- Tags sur les images, rendus sur les cartes et utilisables dans la recherche.
- Auto-tagging IA des images à la sauvegarde.
- Recherche configurable : mode **Avancée** (titre, tags, prompt, paramètres, modèle, étapes) ou **Titre seul**.
- `Échap` vide la recherche active et réaffiche toute la galerie.
- Renommage direct des catégories.
- Vidage réel de la corbeille images pour purger les blobs Base64 supprimés du Store.
- Bulk **Changer de catégorie** pour déplacer plusieurs images à la fois.
- Bulk **Changer le modèle IA** pour réaffecter un modèle à plusieurs images.
- Bulk **Auto-tags IA** pour enrichir une sélection de GPTs ou d'images.
- Bulk **Notes IA** pour générer les notes manquantes sur une sélection de GPTs.
- Sélection rapide des images sans prompt pour nettoyage ou enrichissement.

### Lancement et robustesse
- `2-Lancer.bat` détecte le port Vite `5173` déjà occupé.
- Si l'ancien serveur Vite vient du même dossier projet, il est fermé automatiquement.
- Si le port est utilisé par un autre programme, le script l'indique clairement au lieu d'échouer avec une erreur Vite rouge.

## Roadmap proposée après v3.6

Ces éléments restent de bons chantiers futurs pour les prochaines mises à jour ciblées.

### Stockage & synchronisation
- **Stockage physique des images** : migrer les images Base64 vers un dossier `%APPDATA%/.../images/` et ne garder que les chemins dans le Store.
- **Synchro cloud optionnelle** : Google Drive / Dropbox via export ou synchronisation dédiée.

### Organisation avancée
- **Regroupement automatique avec validation** : proposer des groupes thématiques en lot, prévisualiser les dossiers créés, puis appliquer seulement après confirmation.
- **Détection de doublons plus robuste** : remplacer ou compléter la similarité textuelle par des embeddings locaux quand un moteur compatible est disponible.

### Polish futur
- **Thème clair / sombre** : ajouter un toggle dans les paramètres.
- **Migration d'images assistée** : outil de diagnostic indiquant la taille du Store et le poids des images avant migration physique.

## v3.6.0 — Base multilingue et nettoyage

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
