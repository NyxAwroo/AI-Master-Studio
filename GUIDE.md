# 🆘 Guide : Comment demander une mise à jour à Claude

Ce guide vous explique **quoi envoyer à Claude** selon le type de modification que vous voulez. Plus vous lui donnez les bons fichiers, plus la réponse sera précise et rapide.

---

## 📌 Règle d'or

**Ne jamais envoyer tout le projet à chaque fois.** Claude a une mémoire limitée par conversation. Envoyez juste les fichiers concernés par votre demande.

À chaque nouvelle conversation, commencez par **copier-coller le bloc CONTEXTE** ci-dessous (en bas du guide), puis joignez les fichiers selon le tableau.

---

## 🎯 Quels fichiers selon votre demande ?

### Modification de l'INTERFACE (boutons, modales, layout)
**Joindre :**
- `src/index.html`
- `src/panel.js`
- `src/panel.css` (si la modification concerne le style)
- `src/locales/fr.json` ET `src/locales/en.json` (toujours, si vous ajoutez du texte visible)

**Exemples de demandes :**
- "Ajoute un bouton X dans la barre du haut"
- "Change la couleur des tags"
- "Je voudrais une nouvelle modale pour Y"
- "Rends la galerie d'images plus compacte"

### Modification d'une FONCTIONNALITÉ existante
**Joindre :**
- `src/panel.js`
- `src/index.html` (si l'interface change aussi)
- `src/locales/fr.json` + `src/locales/en.json` (si du texte change)

**Exemples :**
- "La recherche doit aussi chercher dans les paramètres"
- "Quand je clique sur X, je veux que Y se passe"
- "Le drag & drop ne marche pas comme je veux"

### Ajout d'une CAPACITÉ SYSTÈME (lecture URL, fichiers, etc.)
**Joindre :**
- `src/panel.js`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/capabilities/default.json`

**Exemples :**
- "Je veux pouvoir importer du texte depuis une URL"
- "Je veux sauvegarder les images dans des fichiers physiques au lieu du Base64"
- "Ajoute la possibilité d'imprimer un prompt"

### Ajout d'une LANGUE
**Joindre :**
- `src/locales/en.json` (comme base à recopier/traduire)

**Demande type :** "Crée-moi `de.json` (allemand) à partir de en.json."

### Bug à la COMPILATION ou au LANCEMENT
**Joindre :**
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- **+ une capture du terminal** avec l'erreur

**Exemples :**
- "npm run tauri dev affiche une erreur rouge"
- "L'app refuse de démarrer"
- "Le build .exe échoue"

### Bug PENDANT L'UTILISATION
**Joindre :**
- `src/panel.js`
- **+ une capture d'écran** de l'app au moment du bug
- **+ une capture de la console (F12 dans la fenêtre Tauri)** avec les messages d'erreur

---

## 📋 Bloc CONTEXTE à copier-coller en début de conversation

Quand vous démarrez une nouvelle conversation avec Claude, commencez par lui coller ce bloc, **puis** ajoutez votre demande et joignez les fichiers concernés :

```
====================================================================
PROJET : AI Master Studio (v3.6)
====================================================================
Application Tauri v2 + Vite + JavaScript Vanilla + Rust.
Migration d'une ancienne extension Chrome vers une app desktop locale.
Le dossier projet s'appelle simplement "ai-master-studio" (sans suffixe
de version) pour permettre les mises à jour par écrasement.

STRUCTURE :
- Frontend dans /src (index.html, panel.css, panel.js)
- Traductions dans /src/locales/*.json (un fichier par langue)
- Backend Rust dans /src-tauri
- Stockage : plugin @tauri-apps/plugin-store, fichier settings.bin
  dans %APPDATA%/com.nicol.ai-master-studio-v35/ (l'identifier reste
  stable pour préserver les données existantes même si le dossier
  projet et le productName ont changé de nom).

BRIDGE STORAGE (CRITIQUE) :
panel.js commence par un bridge window.chrome.storage qui simule
l'API Chrome Extension via le Tauri Store. Le bridge attend
activement que l'API Tauri soit prête (waitForTauri) avant
d'appeler le store. Tout set/clear est suivi automatiquement
de store.save() pour persister sur disque.

I18N (depuis v3.6) :
- Toutes les chaînes visibles vivent dans /src/locales/*.json.
- Vite scanne automatiquement le dossier via import.meta.glob.
  Pour ajouter une langue : déposer un nouveau JSON, point.
- En HTML : data-i18n="cle" remplace textContent ;
  data-i18n-attr="placeholder:cle,title:cle" remplace des attributs.
- En JS : t('cle', { count: 3 }) pour les chaînes dynamiques.
- Persistance : clé 'appLanguage' dans le Store.

CONSIGNES :
- Fournir des modifications CIBLÉES, pas le code complet.
- Utiliser des commentaires "// ... code existant ..." pour
  indiquer les portions inchangées.
- Vérifier la compatibilité Vite (imports ESM).
- Si un nouveau plugin Tauri est ajouté : préciser les changements
  dans lib.rs ET dans capabilities/default.json.
- Préserver le bridge chrome.storage et la persistance via save().
- Préserver le système i18n : tout nouveau texte visible passe par
  t() côté JS ou data-i18n côté HTML, avec entrée dans fr.json ET en.json.
- Ne jamais utiliser localStorage / sessionStorage.

OBJECTIFS EN ATTENTE (chantiers futurs, pour info) :
1. Refonte du Scraper "Importer texte page active" : aujourd'hui
   le bouton ne fait rien (vestige Chrome Extension). À remplacer
   par un champ URL + commande Rust qui télécharge le HTML.
2. Stockage physique des images : aujourd'hui Base64 dans le store
   (gonfle settings.bin). À migrer vers AppData/.../images/ avec
   juste les chemins dans le store.
3. Synchro cloud optionnelle (Google Drive / Dropbox).

MA DEMANDE :
[décrire ici ce que vous voulez]
====================================================================
```

---

## 🔄 Procédure pour appliquer une modification reçue de Claude

1. **Claude vous envoie des fichiers modifiés** (un ou plusieurs)
2. **Téléchargez-les** depuis la conversation
3. **Faites une sauvegarde** : ⚙️ → Exporter le Backup (.json), gardez-le de côté
4. **Remplacez** les fichiers dans le dossier `ai-master-studio` aux mêmes emplacements
5. **Fermez l'app** si elle tourne (Ctrl+C dans le terminal)
6. **Relancez** : `npm run tauri dev` (ou `2-Lancer.bat`)
7. **Testez** la nouvelle fonctionnalité

Si quelque chose ne marche pas :
- Notez ou capturez l'erreur exacte
- Ouvrez F12 dans la fenêtre Tauri → onglet Console → notez les messages rouges
- Renvoyez à Claude : "Erreur après modification, voici la capture"

---

## ⚠️ Choses à ne JAMAIS faire

- ❌ Ouvrir `localhost:5173` dans Chrome/Edge/Firefox — utilisez seulement la fenêtre Tauri native
- ❌ Modifier le dossier `node_modules` à la main
- ❌ Modifier le dossier `src-tauri/target` à la main
- ❌ Modifier `Cargo.lock` à la main
- ❌ Supprimer `%APPDATA%/com.nicol.ai-master-studio-v35/` sans backup d'abord
- ❌ Lancer deux fois `npm run tauri dev` en parallèle (conflit de port)
- ❌ Ajouter du texte visible en dur dans le HTML ou le JS sans passer par data-i18n ou t() — la cohérence multilingue serait cassée

---

## 📌 Tâches en attente pour de futures conversations

Lors d'une future mise à jour, vous pourrez demander à Claude :

1. **Refonte du Scraper** : actuellement le bouton "📥 Importer texte page active" ne fait rien (vestige de l'ancienne version Chrome Extension). Le remplacer par un champ URL + commande Rust qui télécharge le contenu de la page.

2. **Stockage des images sur disque** : actuellement les images sont en Base64 dans le `settings.bin`, ce qui le rend gros (10 MB). Migrer vers une sauvegarde physique des images dans `%APPDATA%/.../images/` avec seulement les chemins dans le store.

3. **Synchronisation cloud** (Google Drive / Dropbox) : ajouter un onglet pour synchroniser le backup JSON automatiquement.

4. **Mode sombre / clair** : aujourd'hui l'app est en thème sombre fixe. Ajouter un toggle dans ⚙️ Paramètres.

Quand vous serez prêt pour une de ces évolutions, copiez le bloc CONTEXTE, ajoutez "Je veux maintenant attaquer le chantier N°X (refonte scraper / stockage images / synchro cloud / thème)", et joignez les fichiers indiqués par le tableau plus haut.

---

## 🎓 Apprendre progressivement

Si vous voulez comprendre ce que fait votre projet :

- **HTML** = la structure visible (boutons, zones, modales). Voir `src/index.html`.
- **CSS** = l'apparence (couleurs, tailles, espacements). Voir `src/panel.css`.
- **JS (panel.js)** = la logique (que se passe-t-il quand on clique). C'est le plus gros fichier.
- **Locales (locales/*.json)** = tous les textes visibles, un fichier par langue.
- **Rust (lib.rs)** = le pont avec le système (lecture disque, etc.). Très court ici.
- **tauri.conf.json** = les réglages de l'app (titre fenêtre, icônes, dimensions).
- **package.json** = la liste des bibliothèques JS utilisées.
- **Cargo.toml** = la liste des bibliothèques Rust utilisées.

Vous n'avez **pas besoin** de comprendre tout ça pour utiliser l'app. Mais ça aide à savoir quoi demander à Claude.
