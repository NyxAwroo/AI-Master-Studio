/**
 * AI MASTER STUDIO PRO - PANEL.JS
 * v3.6 : Internationalization (FR / EN, et système ouvert pour d'autres langues
 *        via simples fichiers JSON dans src/locales/).
 * v3.5 : Vue grille GPTs, recherche avancée, lightbox zoom, comparateur étapes,
 *        batch tags/export, raccourci nouveau dossier dans modal édition.
 */
// --- BRIDGE TAURI STORE ---
import { LazyStore } from '@tauri-apps/plugin-store';

// --- I18N : chargement statique de TOUS les fichiers de langue présents
// Vite scanne automatiquement src/locales/*.json. Pour ajouter une langue,
// il suffit de déposer un nouveau fichier (ex: de.json) — pas de modif JS.
const localeFiles = import.meta.glob('./locales/*.json', { eager: true });
const LOCALES = {}; // { fr: {...}, en: {...} }
for (const path in localeFiles) {
  const code = path.split('/').pop().replace('.json', '');
  // Vite renvoie { default: {...} } pour les imports JSON
  LOCALES[code] = localeFiles[path].default || localeFiles[path];
}

let currentLang = 'fr'; // sera écrasé après chargement du Store
const FALLBACK_LANG = 'en';

function t(key, vars) {
  const pack = LOCALES[currentLang] || {};
  const fallback = LOCALES[FALLBACK_LANG] || {};
  let str = (pack[key] !== undefined ? pack[key] : (fallback[key] !== undefined ? fallback[key] : key));
  if (vars && typeof str === 'string') {
    for (const k in vars) str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  }
  return str;
}

function applyTranslations(root = document) {
  // textContent
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  // attributs (placeholder, title, etc.) : "placeholder:key,title:key"
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const spec = el.getAttribute('data-i18n-attr');
    spec.split(',').forEach(pair => {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
  // Langue de la balise <html>
  document.documentElement.lang = currentLang;
}

async function setLanguage(code) {
  if (!LOCALES[code]) {
    console.warn('Locale not found:', code, '— fallback to', FALLBACK_LANG);
    code = FALLBACK_LANG;
  }
  currentLang = code;
  applyTranslations();
  // Mettre à jour la bulk bar (texte dynamique)
  updateBulkBar();
  // Re-rendre les chips de filtres (libellés "Tout" / "Non classé" générés en JS)
  try { renderFoldersBar(); } catch (e) { /* pas encore chargé */ }
  try { renderImgFilters(); } catch (e) { /* idem */ }
  // Persister
  try { await chrome.storage.local.set({ appLanguage: code }); } catch (e) { /* store pas prêt */ }
}

// Détection robuste de l'environnement Tauri
// Tauri v2 peut injecter __TAURI_INTERNALS__ légèrement après le chargement initial du JS
function isTauriReady() {
  return typeof window !== 'undefined' &&
         (typeof window.__TAURI_INTERNALS__ !== 'undefined' ||
          typeof window.__TAURI__ !== 'undefined');
}

async function waitForTauri(maxMs = 5000) {
  const startTime = Date.now();
  while (!isTauriReady()) {
    if (Date.now() - startTime > maxMs) {
      console.warn("⚠️ API Tauri non détectée après", maxMs, "ms");
      console.warn("__TAURI__ =", window.__TAURI__);
      console.warn("__TAURI_INTERNALS__ =", window.__TAURI_INTERNALS__);
      return false;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  console.log("✅ Tauri prêt après", Date.now() - startTime, "ms");
  return true;
}

// Le store sera créé une fois Tauri prêt
let store = null;
let tauriReadyPromise = null;

async function getStore() {
  if (store) return store;
  if (!tauriReadyPromise) {
    tauriReadyPromise = waitForTauri().then(ready => {
      if (!ready) {
        throw new Error("API Tauri indisponible. Vérifiez que l'app a été lancée avec 'npm run tauri dev' et non 'npm run dev'.");
      }
      store = new LazyStore('settings.bin');
      return store;
    });
  }
  return tauriReadyPromise;
}

// Bridge chrome.storage → Tauri Store
window.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        const s = await getStore();
        // Cas 1 : get(null) → toutes les clés connues
        if (keys === null || keys === undefined) {
          const allKeys = ['gptLibrary', 'folders', 'imageLibrary', 'imgModels', 'imgCategories', 'customPresets', 'imageZoomLevel', 'gptViewMode', 'gptZoomLevel', 'appLanguage'];
          const result = {};
          for (const k of allKeys) {
            const v = await s.get(k);
            if (v !== undefined && v !== null) result[k] = v;
          }
          return result;
        }
        // Cas 2 : get(['clé1', 'clé2', ...]) → tableau de clés
        if (Array.isArray(keys)) {
          const result = {};
          for (const k of keys) {
            const v = await s.get(k);
            if (v !== undefined && v !== null) result[k] = v;
          }
          return result;
        }
        // Cas 3 : get('clé') → une seule clé
        if (typeof keys === 'string') {
          const v = await s.get(keys);
          return v !== undefined && v !== null ? { [keys]: v } : {};
        }
        // Cas 4 : get({ clé: default }) → objet de défauts
        if (typeof keys === 'object') {
          const result = {};
          for (const k of Object.keys(keys)) {
            const v = await s.get(k);
            result[k] = (v !== undefined && v !== null) ? v : keys[k];
          }
          return result;
        }
        return {};
      },
      set: async (data) => {
        const s = await getStore();
        for (const [key, value] of Object.entries(data)) {
          await s.set(key, value);
        }
        await s.save();
      },
      clear: async () => {
        const s = await getStore();
        await s.clear();
        await s.save();
      }
    }
  }
};

// Exposer le store pour les diagnostics
window._getStore = getStore;
window._isTauriReady = isTauriReady;

// --- CONSTANTES ---
const DEFAULT_PRESETS = {
  chatgpt_4: { label: "ChatGPT 4", limit: 12000 },
  chatgpt_35: { label: "ChatGPT 3.5", limit: 8000 },
  claude_std: { label: "Claude Standard", limit: 25000 },
  gemini_pro: { label: "Gemini Pro", limit: 28000 },
  gemini_reason: { label: "Gemini Reasoning", limit: 20000 }
};

const DEFAULT_IMG_MODELS = ["Nano Banana - Fast", "Nano Banana - Pro", "ChatGPT (DALL-E)", "Midjourney", "Seedream", "Stable Diffusion XL"];
const DEFAULT_IMG_CATS = [{id: "cat_brico", name: "Bricolage"}, {id: "cat_retouche", name: "Retouche Photo"}, {id: "cat_restau", name: "Restauration Photo"}];

// --- STATE ---
let allPresets = {};
let gptLibrary = [];
let folders = []; // Text Folders
let imageLibrary = [];
let imgModels = [];
let imgCategories = []; // Image Categories
// View State
let currentFolderId = "all";
let currentImgCategory = "all"; 
let currentModelFilter = "all"; 
let currentViewingGptId = null;
let currentViewingImgId = null;
let scrollPositions = { library: 0, gallery: 0 }; // For scroll state
let imageZoomLevel = 2; // Default zoom level
let gptViewMode = 'list';  // 'list' | 'grid'
let gptZoomLevel = 2;       // Nombre de colonnes en mode grille
// Lightbox zoom state
let lightboxZoom = 1;
let lightboxPan = { x: 0, y: 0 };
let lightboxDragging = false;
let lightboxDragStart = { x: 0, y: 0 };
// Selection State
let selectedIds = new Set(); // Stores IDs of selected items
let lastSelectedId = null;   // For Shift+Click range
let selectionMode = null;    // 'text' or 'image'

// =========================================================
// 1. DOM ELEMENTS
// =========================================================
const btnDeleteCurrentGPT = document.getElementById('btnDeleteCurrentGPT');
const btnDeleteCurrentImg = document.getElementById('btnDeleteCurrentImg');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const bulkActionBar = document.getElementById('bulkActionBar');
const bulkCount = document.getElementById('bulkCount');
const btnBulkMove = document.getElementById('btnBulkMove');
const btnBulkDelete = document.getElementById('btnBulkDelete');
const btnBulkCancel = document.getElementById('btnBulkCancel');
const btnScrapePage = document.getElementById('btnScrapePage');
const modelSelect = document.getElementById('modelSelect');
const customLimitInput = document.getElementById('customLimit');
const newPresetName = document.getElementById('newPresetName');
const btnSavePreset = document.getElementById('btnSavePreset');
const btnDeletePreset = document.getElementById('btnDeletePreset');
const inputText = document.getElementById('inputText');
const btnSplit = document.getElementById('btnSplit');
const btnClear = document.getElementById('btnClear');
const resultsArea = document.getElementById('resultsArea');
const libraryListView = document.getElementById('libraryListView');
const gptDetailView = document.getElementById('gptDetailView');
const libraryList = document.getElementById('libraryList');
const searchLibrary = document.getElementById('searchLibrary');
const btnOpenCreate = document.getElementById('btnOpenCreate');
const foldersList = document.getElementById('foldersList');
const btnNewFolder = document.getElementById('btnNewFolder');
const btnBackToList = document.getElementById('btnBackToList');
const detailTitle = document.getElementById('detailTitle');
const detailTags = document.getElementById('detailTags');
const gptGlobalNote = document.getElementById('gptGlobalNote');
const btnEditCurrentGPT = document.getElementById('btnEditCurrentGPT');
const detailSystemPrompt = document.getElementById('detailSystemPrompt');
const btnCopySystem = document.getElementById('btnCopySystem');
const stepsList = document.getElementById('stepsList');
const btnOpenAddStep = document.getElementById('btnOpenAddStep');
const imgGalleryView = document.getElementById('imgGalleryView');
const imgDetailView = document.getElementById('imgDetailView');
const imageGalleryGrid = document.getElementById('imageGalleryGrid');
const searchImages = document.getElementById('searchImages');
const btnOpenCreateImg = document.getElementById('btnOpenCreateImg');
const imgCategoryList = document.getElementById('imgCategoryList');
const btnNewImgCategory = document.getElementById('btnNewImgCategory');
const imgModelFilterList = document.getElementById('imgModelFilterList');
const btnManageModels = document.getElementById('btnManageModels');
const btnBackToGallery = document.getElementById('btnBackToGallery');
const imgDetailTitle = document.getElementById('imgDetailTitle');
const imgDetailModel = document.getElementById('imgDetailModel');
const btnEditCurrentImg = document.getElementById('btnEditCurrentImg');
const imgShowcase = document.getElementById('imgShowcase');
const imgDetailPrompt = document.getElementById('imgDetailPrompt');
const btnCopyImgPrompt = document.getElementById('btnCopyImgPrompt');
const imgParamsContainer = document.getElementById('imgParamsContainer');
const imgDetailParams = document.getElementById('imgDetailParams');
const btnCopyImgParams = document.getElementById('btnCopyImgParams');
const imgStepsList = document.getElementById('imgStepsList');
const btnOpenAddImgStep = document.getElementById('btnOpenAddImgStep');
const settingsModal = document.getElementById('settingsModal');
const bulkMoveModal = document.getElementById('bulkMoveModal');
const editModal = document.getElementById('editModal');
const stepModal = document.getElementById('stepModal');
const folderModal = document.getElementById('folderModal');
const imgModal = document.getElementById('imgModal');
const imgStepModal = document.getElementById('imgStepModal');
const imgCategoryModal = document.getElementById('imgCategoryModal');
const modelsManageModal = document.getElementById('modelsManageModal');
const lightboxModal = document.getElementById('lightboxModal');
const btnExportJSON = document.getElementById('btnExportJSON');
const btnImportJSON = document.getElementById('btnImportJSON');
const fileImportJSON = document.getElementById('fileImportJSON');
const bulkMoveSelect = document.getElementById('bulkMoveSelect');
const btnConfirmBulkMove = document.getElementById('btnConfirmBulkMove');
const editIdInput = document.getElementById('editId');
const gptNameInput = document.getElementById('gptName');
const gptFolderSelect = document.getElementById('gptFolderSelect');
const gptTagsInput = document.getElementById('gptTags');
const gptNoteInput = document.getElementById('gptNote');
const gptPromptInput = document.getElementById('gptPrompt');
const btnSaveGPT = document.getElementById('btnSaveGPT');
const stepEditIdInput = document.getElementById('stepEditId');
const stepLabelInput = document.getElementById('stepLabel');
const stepNoteInput = document.getElementById('stepNote');
const stepContentInput = document.getElementById('stepContent');
const btnSaveStep = document.getElementById('btnSaveStep');
const folderNameInput = document.getElementById('folderNameInput');
const btnSaveFolder = document.getElementById('btnSaveFolder');
const imgEditId = document.getElementById('imgEditId');
const imgNameInput = document.getElementById('imgNameInput');
const imgCategorySelect = document.getElementById('imgCategorySelect');
const imgModelSelect = document.getElementById('imgModelSelect');
const imgPromptInput = document.getElementById('imgPromptInput');
const imgParamsInput = document.getElementById('imgParamsInput');
const btnSaveImg = document.getElementById('btnSaveImg');
const imgCategoryNameInput = document.getElementById('imgCategoryNameInput');
const btnSaveImgCategory = document.getElementById('btnSaveImgCategory');
const newModelNameInput = document.getElementById('newModelNameInput');
const btnAddModel = document.getElementById('btnAddModel');
const modelsListContainer = document.getElementById('modelsListContainer');
const lightboxImg = document.getElementById('lightboxImg');
const btnCloseLightbox = document.getElementById('btnCloseLightbox');
const dropZoneBefore = document.getElementById('dropZoneBefore');
const dropZoneAfter = document.getElementById('dropZoneAfter');
const dropZoneStep = document.getElementById('dropZoneStep');
const dropZoneStepAfter = document.getElementById('dropZoneStepAfter');

// =========================================================
// 2. INITIALISATION
// =========================================================

async function init() {
  // 0. I18N : appliquer une langue immédiatement (FR par défaut, sans attendre le store)
  applyTranslations();

  // 1. ON ACTIVE LES BOUTONS EN PREMIER (Quoiqu'il arrive !)
  setupEventListeners();
  setupShortcuts();

  // 2. ON TENTE DE CHARGER LES DONNÉES SOUS HAUTE SÉCURITÉ
  try {
    await loadPresets();
    await loadLibrary(); 
    await loadImgData();
    await loadImageLibrary();

    const data = await chrome.storage.local.get(['imageZoomLevel', 'gptViewMode', 'gptZoomLevel', 'appLanguage']);

    // I18N : appliquer la langue sauvegardée, sinon détection navigateur, sinon FR
    let lang = data.appLanguage;
    if (!lang) {
      const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase();
      lang = LOCALES[nav] ? nav : 'fr';
    }
    populateLanguageSelector(lang);
    await setLanguage(lang);

    if (data.imageZoomLevel) {
      imageZoomLevel = data.imageZoomLevel;
      const slider = document.getElementById('imageZoomSlider');
      slider.value = imageZoomLevel;
      imageGalleryGrid.style.gridTemplateColumns = `repeat(${imageZoomLevel}, 1fr)`;
    }
    if (data.gptViewMode) {
      gptViewMode = data.gptViewMode;
    }
    if (data.gptZoomLevel) {
      gptZoomLevel = data.gptZoomLevel;
      const gz = document.getElementById('gptZoomSlider');
      if (gz) gz.value = gptZoomLevel;
    }
    applyGptViewMode();
  } catch (erreur) {
    // Si Tauri bloque la base de données, on l'attrape ici au lieu de faire planter l'app !
    console.error("🚨 ERREUR DE CHARGEMENT DES DONNÉES :", erreur);
  }
}

function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if(imgGalleryView.offsetParent !== null) searchImages.focus();
      else if(libraryListView.offsetParent !== null) searchLibrary.focus();
    }
    if (e.key === 'Escape') {
      if (selectedIds.size > 0) clearSelection();
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    }
  });
}

// I18N : remplit le <select id="languageSelect"> avec toutes les langues détectées
function populateLanguageSelector(selected) {
  const sel = document.getElementById('languageSelect');
  if (!sel) return;
  sel.innerHTML = '';
  // Tri par code ; fr et en en premier pour la lisibilité
  const codes = Object.keys(LOCALES).sort((a, b) => {
    const order = { fr: 0, en: 1 };
    return (order[a] ?? 99) - (order[b] ?? 99) || a.localeCompare(b);
  });
  for (const code of codes) {
    const meta = LOCALES[code]._meta || {};
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = (meta.name || code.toUpperCase()) + '  (' + code + ')';
    sel.appendChild(opt);
  }
  sel.value = selected;
}

function setupEventListeners() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
      clearSelection();
    });
  });

  btnOpenSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  document.getElementById('btnCloseSettings').addEventListener('click', () => settingsModal.classList.add('hidden'));
  btnExportJSON.addEventListener('click', exportBackup);
  btnImportJSON.addEventListener('click', importBackup);

  // Faux file input traduit : le bouton déclenche l'input natif caché,
  // et le nom du fichier sélectionné est affiché dans un span personnalisé.
  const btnPickRestoreFile = document.getElementById('btnPickRestoreFile');
  const restoreFileName = document.getElementById('restoreFileName');
  if (btnPickRestoreFile && restoreFileName) {
    btnPickRestoreFile.addEventListener('click', () => fileImportJSON.click());
    fileImportJSON.addEventListener('change', () => {
      const f = fileImportJSON.files && fileImportJSON.files[0];
      restoreFileName.textContent = f ? f.name : t('settings.noFile');
      // Le span n'est plus i18n-géré une fois qu'il contient un nom de fichier ;
      // on retire l'attribut data-i18n pour que setLanguage ne l'écrase pas.
      if (f) restoreFileName.removeAttribute('data-i18n');
      else restoreFileName.setAttribute('data-i18n', 'settings.noFile');
    });
  }

  // I18N : changement de langue à la volée
  const langSel = document.getElementById('languageSelect');
  if (langSel) {
    langSel.addEventListener('change', (e) => setLanguage(e.target.value));
  }

  btnBulkCancel.addEventListener('click', clearSelection);
  btnBulkDelete.addEventListener('click', deleteSelectedItems);
  btnBulkMove.addEventListener('click', openBulkMoveModal);
  btnConfirmBulkMove.addEventListener('click', confirmBulkMove);
  document.getElementById('btnCloseBulkMove').addEventListener('click', () => bulkMoveModal.classList.add('hidden'));

  // --- Batch tags ---
  document.getElementById('btnBulkTags').addEventListener('click', openBulkTagsModal);
  document.getElementById('btnCloseBulkTags').addEventListener('click', () => document.getElementById('bulkTagsModal').classList.add('hidden'));
  document.getElementById('btnConfirmBulkTags').addEventListener('click', confirmBulkTags);

  // --- Batch export / import partiel ---
  document.getElementById('btnBulkExport').addEventListener('click', exportSelection);
  document.getElementById('btnImportPartial').addEventListener('click', () => document.getElementById('filePartialImport').click());
  document.getElementById('filePartialImport').addEventListener('change', importPartial);

  btnScrapePage.addEventListener('click', scrapePage);
  modelSelect.addEventListener('change', updateLimitInput);
  btnSavePreset.addEventListener('click', saveCustomPreset);
  btnDeletePreset.addEventListener('click', deleteCustomPreset);
  btnSplit.addEventListener('click', processSplit);
  btnClear.addEventListener('click', () => { inputText.value = ''; resultsArea.innerHTML = ''; });

  btnOpenCreate.addEventListener('click', () => openMainModal());
  searchLibrary.addEventListener('input', (e) => renderLibrary(e.target.value));
  btnBackToList.addEventListener('click', showListView);
  
  btnNewFolder.addEventListener('click', () => {
    folderNameInput.value = ''; folderModal.classList.remove('hidden'); folderNameInput.focus();
  });
  document.getElementById('btnCloseFolderModal').addEventListener('click', () => folderModal.classList.add('hidden'));
  btnSaveFolder.addEventListener('click', saveNewFolder);

  // --- Toggle vue liste/grille pour GPTs ---
  document.getElementById('btnGptViewToggle').addEventListener('click', async () => {
    gptViewMode = (gptViewMode === 'list') ? 'grid' : 'list';
    await chrome.storage.local.set({ gptViewMode });
    applyGptViewMode();
  });
  document.getElementById('gptZoomSlider').addEventListener('input', async (e) => {
    gptZoomLevel = parseInt(e.target.value);
    await chrome.storage.local.set({ gptZoomLevel });
    applyGptViewMode();
  });

  // --- Raccourci nouveau dossier depuis le modal d'édition GPT ---
  document.getElementById('btnQuickNewFolder').addEventListener('click', quickCreateFolder);

  btnCopySystem.addEventListener('click', (e) => copyToClipboard(detailSystemPrompt.textContent, e.target));
  btnEditCurrentGPT.addEventListener('click', () => {
    const gpt = gptLibrary.find(g => g.id === currentViewingGptId);
    if(gpt) openMainModal(gpt);
  });
  btnOpenAddStep.addEventListener('click', () => openStepModal());

  document.getElementById('btnCloseModal').addEventListener('click', () => editModal.classList.add('hidden'));
  btnSaveGPT.addEventListener('click', saveGPT);
  document.getElementById('btnCloseStepModal').addEventListener('click', () => stepModal.classList.add('hidden'));
  btnSaveStep.addEventListener('click', saveStep);

  gptPromptInput.addEventListener('blur', () => {
    const currentTags = gptTagsInput.value.split(',').map(x => x.trim()).filter(x => x && x.length > 0);
    autoSuggestTags(gptPromptInput.value, currentTags);
  });

  btnOpenCreateImg.addEventListener('click', () => openImgModal());
  document.getElementById('btnCloseImgModal').addEventListener('click', () => imgModal.classList.add('hidden'));
  btnSaveImg.addEventListener('click', saveImg);
  searchImages.addEventListener('input', (e) => renderImageGallery(e.target.value));

  // --- Import partiel pour Studio Img ---
  document.getElementById('btnImportPartialImg').addEventListener('click', () => document.getElementById('filePartialImportImg').click());
  document.getElementById('filePartialImportImg').addEventListener('change', importPartial);

  // --- Pense-bête raccourcis ---
  document.getElementById('btnShortcuts').addEventListener('click', () => document.getElementById('shortcutsModal').classList.remove('hidden'));
  document.getElementById('btnCloseShortcuts').addEventListener('click', () => document.getElementById('shortcutsModal').classList.add('hidden'));

  // --- Raccourcis clavier globaux ---
  setupKeyboardShortcuts();
  
  btnNewImgCategory.addEventListener('click', () => {
    imgCategoryNameInput.value = ''; imgCategoryModal.classList.remove('hidden'); imgCategoryNameInput.focus();
  });
  document.getElementById('btnCloseImgCategory').addEventListener('click', () => imgCategoryModal.classList.add('hidden'));
  btnSaveImgCategory.addEventListener('click', saveImgCategory);

  btnManageModels.addEventListener('click', openModelsManager);
  document.getElementById('btnCloseModelsManage').addEventListener('click', () => modelsManageModal.classList.add('hidden'));
  btnAddModel.addEventListener('click', addNewModel);

  btnBackToGallery.addEventListener('click', showImgGallery);
 
  btnEditCurrentImg.addEventListener('click', () => {
      const img = imageLibrary.find(i => i.id === currentViewingImgId);
      if(img) openImgModal(img);
    });
  btnCopyImgPrompt.addEventListener('click', (e) => copyToClipboard(imgDetailPrompt.textContent, e.target));
  btnCopyImgParams.addEventListener('click', (e) => copyToClipboard(imgDetailParams.textContent, e.target));
  
  btnOpenAddImgStep.addEventListener('click', () => openImgStepModal());
  document.getElementById('btnCloseImgStepModal').addEventListener('click', () => imgStepModal.classList.add('hidden'));
  document.getElementById('btnSaveImgStep').addEventListener('click', saveImgStep);

  btnCloseLightbox.addEventListener('click', () => lightboxModal.classList.add('hidden'));
  lightboxModal.addEventListener('click', (e) => { if(e.target === lightboxModal) lightboxModal.classList.add('hidden'); });
  setupLightboxZoom();

  setupDropZone(dropZoneBefore, 'previewBefore');
  setupDropZone(dropZoneAfter, 'previewAfter');
  setupDropZone(dropZoneStep, 'previewStep');
  setupDropZone(dropZoneStepAfter, 'previewStepAfter');
  setupDropZone(document.getElementById('dropZoneGpt'), 'previewGpt');
  setupDropZone(document.getElementById('dropZoneGptStep'), 'previewGptStep');
  setupModalGlobalDrop(); // drop n'importe où dans le modal image

  if(btnDeleteCurrentGPT) btnDeleteCurrentGPT.addEventListener('click', deleteCurrentGPT);
  if(btnDeleteCurrentImg) btnDeleteCurrentImg.addEventListener('click', deleteCurrentImg);

  document.getElementById('imageZoomSlider').addEventListener('input', (e) => {
      const newZoomLevel = e.target.value;
      imageGalleryGrid.style.gridTemplateColumns = `repeat(${newZoomLevel}, 1fr)`;
      chrome.storage.local.set({ imageZoomLevel: newZoomLevel });
  });
}

// =========================================================
// 3. LOGIQUE GLOBALE (Backup, ColorTags, Scraper)
// =========================================================

async function scrapePage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
      return alert(t('alerts.systemPage'));
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText
    });
    if (results && results[0] && results[0].result) {
      inputText.value = results[0].result;
      const originalText = btnScrapePage.textContent;
      btnScrapePage.textContent = t('alerts.scrapeImported');
      setTimeout(() => btnScrapePage.textContent = originalText, 1500);
    } else {
      alert(t('alerts.noTextOnPage'));
    }
  } catch (err) {
    console.error(err);
    alert(t('alerts.scrapeAccessError'));
  }
}

async function exportBackup() {
  const data = await chrome.storage.local.get(null);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai_master_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importBackup() {
  const file = fileImportJSON.files[0];
  if (!file) return alert(t('alerts.pickJsonFile'));
  if(!confirm(t('alerts.restoreWarn'))) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      return alert(t('alerts.invalidJson') + err.message);
    }

    // Vérifier que Tauri est prêt
    if (typeof window.__TAURI_INTERNALS__ === 'undefined') {
      return alert(t('alerts.tauriUnavailable'));
    }

    const status = document.createElement('div');
    status.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#2a2b32;border:1px solid #565869;padding:20px;border-radius:8px;z-index:10001;color:white;font-size:13px;text-align:center;min-width:280px;';
    status.innerHTML = '⏳ Restauration en cours...<br><span id="restoreProgress">Préparation...</span>';
    document.body.appendChild(status);

    try {
      // 1. Effacer l'existant
      document.getElementById('restoreProgress').textContent = "Nettoyage des anciennes données...";
      await store.clear();

      // 2. Restaurer clé par clé (évite d'envoyer 10 MB d'un coup à invoke)
      const keys = Object.keys(data);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        document.getElementById('restoreProgress').textContent = `${k} (${i+1}/${keys.length})`;
        await store.set(k, data[k]);
      }

      // 3. Sauvegarde physique
      document.getElementById('restoreProgress').textContent = "Écriture sur disque...";
      await store.save();

      document.body.removeChild(status);
      alert(t('alerts.restoreDone'));
      location.reload();
    } catch (err) {
      if (status.parentNode) document.body.removeChild(status);
      console.error("Erreur restauration :", err);
      alert(t('alerts.restoreError') + (err.message || err) + t('alerts.restoreErrorTail'));
    }
  };
  reader.readAsText(file);
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 35%)`;
}

// =========================================================
// 4. LOGIQUE SELECTION & BULK ACTIONS
// =========================================================

function toggleSelection(e, id, type) {
  if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return false;
  e.preventDefault();
  e.stopPropagation();
  if (selectionMode && selectionMode !== type) clearSelection();
  selectionMode = type;

  // Shift+clic = sélection étendue (range)
  if (e.shiftKey && lastSelectedId && lastSelectedId !== id) {
    // Récupérer la liste visible dans l'ordre du DOM
    const cardsSelector = (type === 'text') ? '.gpt-card' : '.gallery-card';
    const cards = Array.from(document.querySelectorAll(cardsSelector));
    const ids = cards.map(c => c.dataset.id);
    const startIdx = ids.indexOf(lastSelectedId);
    const endIdx = ids.indexOf(id);
    if (startIdx !== -1 && endIdx !== -1) {
      const [a, b] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      // Si Ctrl+Shift+clic : on étend sans reset
      // Sinon Shift+clic seul : on remplace par cette plage
      if (!e.ctrlKey && !e.metaKey) {
        selectedIds.clear();
      }
      for (let i = a; i <= b; i++) selectedIds.add(ids[i]);
      lastSelectedId = id;
      updateSelectionUI();
      return true;
    }
  }

  // Ctrl/Cmd+clic = toggle individuel
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  lastSelectedId = id;
  updateSelectionUI();
  return true;
}

// Sélectionner tous les éléments visibles dans l'onglet actif
function selectAllVisible() {
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return;
  const cardsSelector = activeTab.id === 'view-library' ? '.gpt-card' : '.gallery-card';
  const cards = activeTab.querySelectorAll(cardsSelector);
  if (cards.length === 0) return;
  selectionMode = activeTab.id === 'view-library' ? 'text' : 'image';
  cards.forEach(c => selectedIds.add(c.dataset.id));
  updateSelectionUI();
}

function updateSelectionUI() {
  document.querySelectorAll('.gpt-card, .gallery-card').forEach(card => {
    const cardId = card.dataset.id;
    if (selectedIds.has(cardId)) card.classList.add('selected-card');
    else card.classList.remove('selected-card');
  });
  if (selectedIds.size > 0) {
    bulkActionBar.classList.remove('hidden');
    bulkCount.textContent = `${selectedIds.size} ${t('bulk.count')}`;
  } else {
    bulkActionBar.classList.add('hidden');
    selectionMode = null;
  }
}

// I18N : alias appelé après un changement de langue pour rafraîchir le compteur
function updateBulkBar() {
  if (selectedIds.size > 0) {
    bulkCount.textContent = `${selectedIds.size} ${t('bulk.count')}`;
  }
}

function clearSelection() {
  selectedIds.clear();
  lastSelectedId = null;
  updateSelectionUI();
}

async function deleteSelectedItems() {
  if (!confirm(t('alerts.confirmBulkDelete', { count: selectedIds.size }))) return;

  if (selectionMode === 'text') {
    gptLibrary.forEach(g => {
      if (selectedIds.has(g.id)) g.deleted = true;
    });
    await chrome.storage.local.set({ gptLibrary });
    renderLibrary(searchLibrary.value);
  } else if (selectionMode === 'image') {
    imageLibrary.forEach(i => {
      if (selectedIds.has(i.id)) i.deleted = true;
    });
    await chrome.storage.local.set({ imageLibrary });
    renderImageGallery(searchImages.value);
  }
  clearSelection();
}

function openBulkMoveModal() {
  bulkMoveModal.classList.remove('hidden');
  bulkMoveSelect.innerHTML = '<option value="">(Sans dossier/catégorie)</option>';
  if (selectionMode === 'text') {
    folders.forEach(f => {
      const opt = document.createElement('option'); opt.value = f.id; opt.textContent = f.name;
      bulkMoveSelect.appendChild(opt);
    });
  } else {
    imgCategories.forEach(c => {
      const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.name;
      bulkMoveSelect.appendChild(opt);
    });
  }
}

async function confirmBulkMove() {
  const targetId = bulkMoveSelect.value;
  if (selectionMode === 'text') {
    gptLibrary.forEach(g => { if (selectedIds.has(g.id)) g.folderId = targetId; });
    await chrome.storage.local.set({ gptLibrary });
    renderLibrary(searchLibrary.value);
  } else {
    imageLibrary.forEach(i => { if (selectedIds.has(i.id)) i.categoryId = targetId; });
    await chrome.storage.local.set({ imageLibrary });
    renderImageGallery(searchImages.value);
  }
  bulkMoveModal.classList.add('hidden');
  clearSelection();
}

// =========================================================
// 5. SPLITTER LOGIC (UNCHANGED)
// =========================================================
async function loadPresets(){ const r=await chrome.storage.local.get(['customPresets']); allPresets={...DEFAULT_PRESETS,...(r.customPresets||{})}; modelSelect.innerHTML=''; const gd=document.createElement('optgroup'); gd.label="Standards"; Object.entries(DEFAULT_PRESETS).forEach(([k,v])=>{const o=document.createElement('option');o.value=k;o.textContent=v.label;gd.appendChild(o)}); modelSelect.appendChild(gd); if(Object.keys(r.customPresets||{}).length){const gc=document.createElement('optgroup');gc.label="Perso";Object.entries(r.customPresets).forEach(([k,v])=>{const o=document.createElement('option');o.value=k;o.textContent=`★ ${v.label}`;gc.appendChild(o)});modelSelect.appendChild(gc);} updateLimitInput(); }
function updateLimitInput(){const v=modelSelect.value;if(allPresets[v]){customLimitInput.value=allPresets[v].limit;btnDeletePreset.style.display=DEFAULT_PRESETS[v]?'none':'flex';}}
async function saveCustomPreset(){const n=newPresetName.value.trim(),l=parseInt(customLimitInput.value);if(!n||!l)return;const id=`c_${Date.now()}`,r=await chrome.storage.local.get(['customPresets']),c=r.customPresets||{};c[id]={label:n,limit:l};await chrome.storage.local.set({customPresets:c});newPresetName.value='';loadPresets();}
async function deleteCustomPreset(){if(DEFAULT_PRESETS[modelSelect.value])return;if(!confirm(t('alerts.confirmDeletePreset')))return;const r=await chrome.storage.local.get(['customPresets']),c=r.customPresets||{};delete c[modelSelect.value];await chrome.storage.local.set({customPresets:c});loadPresets();}
function processSplit(){const t=inputText.value.trim(),m=parseInt(customLimitInput.value);if(!t)return;resultsArea.innerHTML='';const c=smartSplit(t,m);c.forEach((ch,i)=>createChunkCard(ch,i+1,c.length));}
function smartSplit(t,m){const c=[];let cur=t;while(cur.length>0){if(cur.length<=m){c.push(cur);break;}let sl=cur.substr(0,m),cut=-1,zn=Math.floor(m*0.8),ln=sl.lastIndexOf('\n');if(ln>zn)cut=ln;else{const lp=Math.max(sl.lastIndexOf('. '),sl.lastIndexOf('! '),sl.lastIndexOf('? '));if(lp>zn)cut=lp+1;}if(cut===-1)cut=sl.lastIndexOf(' ');if(cut===-1)cut=m;c.push(cur.substring(0,cut).trim());cur=cur.substring(cut).trim();}return c;}
function createChunkCard(t,p,tp){const w=document.createElement('div');w.className='chunk-card';const st=`[START PART ${p}/${tp}]`,et=`[END PART ${p}/${tp}]`;let c=(tp>1&&p===1)?`The total length...\n\n${st}\n${t}\n${et}`:(tp>1?`${st}\n${t}\n${et}`:t);if(tp>1&&p===tp)c+=`\n\nALL PARTS SENT`;w.innerHTML=`<div class="chunk-header"><span>Partie ${p}/${tp}</span><span>${t.length}c</span></div><div class="prompt-preview">${t}</div><button class="copy-prompt-btn">Copier (Formaté)</button>`;w.querySelector('button').onclick=(e)=>copyToClipboard(c,e.target);resultsArea.appendChild(w);}

// =========================================================
// 6. GPT LIBRARY LOGIC
// =========================================================
async function loadLibrary() {
  const r = await chrome.storage.local.get(['gptLibrary', 'folders']);
  gptLibrary = r.gptLibrary || []; 
  folders = r.folders || [];
  gptLibrary.forEach(g => { 
      if(!g.steps) g.steps=[]; 
      if(!g.folderId) g.folderId="";
      if(g.deleted === undefined) g.deleted = false;
      g.steps.forEach(s => { if(s.deleted === undefined) s.deleted = false; });
  });
  renderFoldersBar(); 
  renderLibrary();
}

async function saveNewFolder() { const n = folderNameInput.value.trim(); if(!n) return; folders.push({id:`f_${Date.now()}`, name:n}); await chrome.storage.local.set({folders}); folderModal.classList.add('hidden'); renderFoldersBar(); }
async function deleteFolder(id) { if(!confirm(t('alerts.confirmDeleteFolder'))) return; folders = folders.filter(f=>f.id!==id); gptLibrary.forEach(g => { if(g.folderId === id) g.folderId = ""; }); await chrome.storage.local.set({folders, gptLibrary}); if(currentFolderId===id)currentFolderId='all'; renderFoldersBar(); renderLibrary(searchLibrary.value); }

function renderFoldersBar() {
  foldersList.innerHTML = '';
  createChip(foldersList, t('filters.all'), 'all', currentFolderId, (id)=>{currentFolderId=id; renderLibrary(searchLibrary.value);});
  createChip(foldersList, t('filters.unclassified'), 'none', currentFolderId, (id)=>{currentFolderId=id; renderLibrary(searchLibrary.value);});
  folders.forEach(f => {
    const chip = document.createElement('button'); chip.className = `folder-chip ${currentFolderId===f.id?'active':''}`; chip.textContent=f.name;
    chip.onclick=()=>{currentFolderId=f.id; renderFoldersBar(); renderLibrary(searchLibrary.value);}
    chip.oncontextmenu=(e)=>{e.preventDefault(); deleteFolder(f.id);}
    foldersList.appendChild(chip);
  });
}

function createChip(parent, lbl, id, curId, cb) { const b=document.createElement('button'); b.className=`folder-chip ${curId===id?'active':''}`; b.textContent=lbl; b.onclick=()=>{cb(id); renderFoldersBar();}; parent.appendChild(b); }

function renderLibrary(filter='') {
  libraryList.innerHTML = ''; 
  const term = filter.toLowerCase().trim();
  let sub = gptLibrary.filter(g => !g.deleted);

  if(currentFolderId==='none') sub=sub.filter(g=>!g.folderId);
  else if(currentFolderId!=='all') sub=sub.filter(g=>g.folderId===currentFolderId);
  
  // Recherche avancée : titre + tags + prompt principal + note + contenu des étapes
  const filtered = !term ? sub : sub.filter(g => {
    if (g.name.toLowerCase().includes(term)) return true;
    if (g.tags && g.tags.some(t => t.toLowerCase().includes(term))) return true;
    if (g.prompt && g.prompt.toLowerCase().includes(term)) return true;
    if (g.note && g.note.toLowerCase().includes(term)) return true;
    if (g.steps && g.steps.some(s => !s.deleted && (
      (s.label && s.label.toLowerCase().includes(term)) ||
      (s.content && s.content.toLowerCase().includes(term)) ||
      (s.note && s.note.toLowerCase().includes(term))
    ))) return true;
    return false;
  });
  if(filtered.length===0){ libraryList.innerHTML='<div class="empty-state">Vide</div>'; return; }

  const isGrid = (gptViewMode === 'grid');

  filtered.forEach(gpt => {
    const card = document.createElement('div'); card.className = 'gpt-card'; card.dataset.id = gpt.id;
    if(selectedIds.has(gpt.id)) card.classList.add('selected-card');

    const tagsHtml = (gpt.tags||[]).map(t => `<span class="tag" style="background:${stringToColor(t)};">${t}</span>`).join('');
    let noteHtml = (gpt.note && gpt.note.trim()) ? `<div class="card-note-preview">${gpt.note}</div>` : '';

    if (isGrid) {
      // Vue grille avec aperçu prompt + image de couverture si présente
      const promptPreview = (gpt.prompt || '').slice(0, 220);
      const coverHtml = gpt.coverImg ? `<img src="${gpt.coverImg}" class="gpt-cover-img">` : '';
      card.innerHTML = `<button class="card-delete-btn danger icon-btn small-icon">&times;</button>${coverHtml}<span class="card-title">${gpt.name}</span>${noteHtml}<div class="gpt-prompt-preview">${promptPreview}</div><div class="tags-container">${tagsHtml}</div>`;
    } else {
      // Vue liste compacte
      const coverHtml = gpt.coverImg ? `<img src="${gpt.coverImg}" class="gpt-cover-img" style="max-height:80px;">` : '';
      card.innerHTML = `<button class="card-delete-btn danger icon-btn small-icon">&times;</button>${coverHtml}<span class="card-title">${gpt.name}</span>${noteHtml}<div class="tags-container">${tagsHtml}</div>`;
    }
    
    card.querySelector('.card-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteGPT(gpt.id);
    });

    card.addEventListener('click', (e) => {
      if(!toggleSelection(e, gpt.id, 'text')) showDetailView(gpt);
    });
    libraryList.appendChild(card);
  });
  setTimeout(() => window.scrollTo(0, scrollPositions.library), 0);
}

function showListView() { 
  gptDetailView.classList.add('hidden'); 
  libraryListView.classList.remove('hidden'); 
  currentViewingGptId=null; 
  renderLibrary(searchLibrary.value); 
}

function showDetailView(gpt) {
  scrollPositions.library = window.scrollY;
  currentViewingGptId=gpt.id;
  libraryListView.classList.add('hidden');
  gptDetailView.classList.remove('hidden');
  detailTitle.textContent=gpt.name;
  detailTags.innerHTML=(gpt.tags||[]).map(t=>`<span class="tag" style="background:${stringToColor(t)};">${t}</span>`).join('');
  gptGlobalNote.classList.toggle('hidden', !gpt.note);
  gptGlobalNote.innerHTML=`<span class="note-label">Info:</span>${gpt.note||''}`;

  // Image de couverture du GPT (cliquable → lightbox)
  let coverHtml = '';
  if (gpt.coverImg) {
    coverHtml = `<img src="${gpt.coverImg}" class="gpt-cover-img" id="gptDetailCover">`;
  }
  // On insère/remplace dynamiquement la couverture avant le system-card
  const detailContent = document.querySelector('#gptDetailView .detail-content');
  const oldCover = detailContent.querySelector('.gpt-cover-img');
  if (oldCover) oldCover.remove();
  if (coverHtml) {
    const wrap = document.createElement('div');
    wrap.innerHTML = coverHtml;
    const coverEl = wrap.firstChild;
    detailContent.insertBefore(coverEl, detailContent.firstChild);
    coverEl.addEventListener('click', () => openLightbox(gpt.coverImg));
  }

  detailSystemPrompt.textContent=gpt.prompt;
  stepsList.innerHTML='';

  const visibleSteps = (gpt.steps||[]).filter(s => !s.deleted);
  visibleSteps.forEach((s,i)=>{
    const originalIndex = gpt.steps.findIndex(os => os.id === s.id);
    const w=document.createElement('div');
    w.className='step-item-wrapper';
    w.setAttribute('draggable','true');
    w.dataset.index=originalIndex;
    const nh=(s.note)?`<div class="personal-note" style="margin:5px 0"><span class="note-label">Note:</span>${s.note}</div>`:'';
    const imgH = s.img ? `<img src="${s.img}" class="gpt-step-img" data-step-img="${s.id}">` : '';
    w.innerHTML=`<div class="timeline-connector"></div><div class="step-card"><div class="step-header"><div><span style="opacity:0.5;cursor:grab">☰</span> <span class="step-badge step">${s.label||`Étape ${i+1}`}</span></div><div><button class="step-actions-btn edit">✎</button><button class="step-actions-btn del">&times;</button></div></div>${nh}${imgH}<div class="prompt-preview">${s.content}</div><button class="copy-prompt-btn">Copier</button></div>`;
    w.querySelector('.copy-prompt-btn').onclick=(e)=>copyToClipboard(s.content,e.target);
    w.querySelector('.edit').onclick=()=>openStepModal(s);
    w.querySelector('.del').onclick=()=>deleteStep(s.id);
    const imgEl = w.querySelector('.gpt-step-img');
    if (imgEl) imgEl.addEventListener('click', (ev) => { ev.stopPropagation(); openLightbox(s.img); });
    stepsList.appendChild(w);
  });
  enableDragAndDrop(gpt, 'gpt');
}

async function saveGPT() {
    const id=editIdInput.value, name=gptNameInput.value.trim(), fid=gptFolderSelect.value, p=gptPromptInput.value.trim(), n=gptNoteInput.value.trim(), t=gptTagsInput.value.split(',').map(x=>x.trim()).filter(x=>x);
    if(!name||!p)return alert(t('alerts.missingNamePrompt'));
    const existing = id ? gptLibrary.find(x => x.id === id) : null;
    const coverImg = getPreviewValue('previewGpt', existing?.coverImg);
    if(id){
        const i=gptLibrary.findIndex(x=>x.id===id);
        if(i!==-1) gptLibrary[i]={...gptLibrary[i],name,folderId:fid,tags:t,note:n,prompt:p,coverImg};
        if(currentViewingGptId===id) showDetailView(gptLibrary[i]);
    } else {
        gptLibrary.unshift({id:`g_${Date.now()}`,name,folderId:fid,tags:t,note:n,prompt:p,coverImg,steps:[],created:Date.now(),deleted:false});
    }
    await chrome.storage.local.set({gptLibrary});
    editModal.classList.add('hidden');
    if(!currentViewingGptId) {
        renderLibrary(searchLibrary.value);
    } else {
        const g = gptLibrary.find(g => g.id === currentViewingGptId);
        if(g) showDetailView(g);
    }
}

function openMainModal(g){
    editModal.classList.remove('hidden');
    const sel=document.getElementById('gptFolderSelect');
    sel.innerHTML='<option value="">(Aucun)</option>';
    folders.forEach(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.name;sel.appendChild(o)});
    if(g){
        editIdInput.value=g.id;
        gptNameInput.value=g.name;
        sel.value=g.folderId||"";
        gptTagsInput.value=(g.tags||[]).join(',');
        gptNoteInput.value=g.note||"";
        gptPromptInput.value=g.prompt;
        setPreview('previewGpt', g.coverImg || '');
    } else {
        editIdInput.value="";
        gptNameInput.value="";
        sel.value=(currentFolderId!=='all'&&currentFolderId!=='none')?currentFolderId:"";
        gptTagsInput.value="";
        gptNoteInput.value="";
        gptPromptInput.value="";
        setPreview('previewGpt', '');
    }
}

function openStepModal(s){
    stepModal.classList.remove('hidden');
    if(s){
        stepEditIdInput.value=s.id;
        stepLabelInput.value=s.label;
        stepNoteInput.value=s.note;
        stepContentInput.value=s.content;
        setPreview('previewGptStep', s.img || '');
    } else {
        stepEditIdInput.value="";
        stepLabelInput.value="";
        stepNoteInput.value="";
        stepContentInput.value="";
        setPreview('previewGptStep', '');
    }
}

async function saveStep(){
    const g=gptLibrary.find(x=>x.id===currentViewingGptId);if(!g)return;
    const id=stepEditIdInput.value,l=stepLabelInput.value,n=stepNoteInput.value,c=stepContentInput.value;
    if(!c)return;
    const existingStep = id ? g.steps.find(s => s.id === id) : null;
    const img = getPreviewValue('previewGptStep', existingStep?.img);
    if(id){
        const i=g.steps.findIndex(s=>s.id===id);
        if(i!==-1) g.steps[i]={...g.steps[i],label:l,note:n,content:c,img};
    } else {
        g.steps.push({id:`s_${Date.now()}`,label:l,note:n,content:c,img,deleted:false});
    }
    await chrome.storage.local.set({gptLibrary});
    stepModal.classList.add('hidden');
    showDetailView(g);
}

async function deleteGPT(id) {
    if (!confirm(t('alerts.confirmTrashGpt'))) return;
    const gpt = gptLibrary.find(g => g.id === id);
    if (gpt) {
        gpt.deleted = true;
        await chrome.storage.local.set({ gptLibrary });
        renderLibrary(searchLibrary.value);
    }
}

async function deleteCurrentGPT() {
    if (!currentViewingGptId) return;
    deleteGPT(currentViewingGptId);
    showListView();
}

async function deleteStep(id){
    if(!confirm(t('alerts.confirmDeleteStep')))return;
    const g=gptLibrary.find(x=>x.id===currentViewingGptId);
    if (g) {
        const step = g.steps.find(s => s.id === id);
        if (step) {
            step.deleted = true;
        }
        await chrome.storage.local.set({gptLibrary});
        showDetailView(g);
    }
}

// Drag-and-drop générique pour réordonner les étapes d'un GPT texte ou d'une image
function enableDragAndDrop(item, kind) {
    // kind: 'gpt' ou 'image'
    const wrappers = document.querySelectorAll('.step-item-wrapper');
    let dragSrc = null;
    let dragSrcIndex = null;

    wrappers.forEach(wrapper => {
        wrapper.addEventListener('dragstart', function(ev){
            // Ignorer si l'utilisateur a commencé à sélectionner du texte
            const tag = (ev.target.tagName || '').toLowerCase();
            if (tag === 'textarea' || tag === 'input' || tag === 'button') {
                ev.preventDefault();
                return;
            }
            dragSrc = this;
            dragSrcIndex = parseInt(this.dataset.index);
            ev.dataTransfer.effectAllowed = 'move';
            // Nécessaire pour Firefox : poser des data même bidon
            try { ev.dataTransfer.setData('text/plain', String(dragSrcIndex)); } catch(_){}
            this.classList.add('dragging');
        });

        wrapper.addEventListener('dragenter', function(ev){
            ev.preventDefault();
            if (dragSrc && dragSrc !== this) this.classList.add('over');
        });

        wrapper.addEventListener('dragover', function(ev){
            // OBLIGATOIRE : sans preventDefault le drop n'est jamais accepté
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            return false;
        });

        wrapper.addEventListener('dragleave', function(ev){
            // Ne retirer le surlignage que si la souris a vraiment quitté le wrapper
            if (!this.contains(ev.relatedTarget)) {
                this.classList.remove('over');
            }
        });

        wrapper.addEventListener('drop', async function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            this.classList.remove('over');
            if (!dragSrc || dragSrc === this) return false;
            const oldIdx = dragSrcIndex;
            const newIdx = parseInt(this.dataset.index);
            const moved = item.steps.splice(oldIdx, 1)[0];
            item.steps.splice(newIdx, 0, moved);
            if (kind === 'gpt') {
                await chrome.storage.local.set({ gptLibrary });
                showDetailView(item);
            } else {
                await chrome.storage.local.set({ imageLibrary });
                showImgDetail(item);
            }
            return false;
        });

        wrapper.addEventListener('dragend', function(){
            wrappers.forEach(w => { w.classList.remove('dragging'); w.classList.remove('over'); });
            dragSrc = null; dragSrcIndex = null;
        });
    });
}

// =========================================================
// 7. IMAGE STUDIO
// =========================================================
async function loadImgData() {
  const r = await chrome.storage.local.get(['imgModels', 'imgCategories']);
  imgModels = r.imgModels || [...DEFAULT_IMG_MODELS];
  imgCategories = r.imgCategories || [...DEFAULT_IMG_CATS];
  renderImgFilters();
}

async function saveImgCategory() { const n = imgCategoryNameInput.value.trim(); if(!n) return; imgCategories.push({id:`cat_${Date.now()}`, name:n}); await chrome.storage.local.set({imgCategories}); imgCategoryModal.classList.add('hidden'); renderImgFilters(); }
async function deleteImgCategory(id) { if(!confirm(t('alerts.confirmDeleteCategory'))) return; imgCategories=imgCategories.filter(c=>c.id!==id); await chrome.storage.local.set({imgCategories}); if(currentImgCategory===id)currentImgCategory='all'; renderImgFilters(); renderImageGallery(searchImages.value); }

function renderImgFilters() {
  imgCategoryList.innerHTML='';
  createChip(imgCategoryList, t('filters.all'), 'all', currentImgCategory, (id)=>{currentImgCategory=id; renderImageGallery(searchImages.value);});
  createChip(imgCategoryList, t('filters.unclassified'), 'none', currentImgCategory, (id)=>{currentImgCategory=id; renderImageGallery(searchImages.value);});
  imgCategories.forEach(c=>{
    const b=document.createElement('button'); b.className=`folder-chip ${currentImgCategory===c.id?'active':''}`; b.textContent=c.name;
    b.onclick=()=>{currentImgCategory=c.id; renderImgFilters(); renderImageGallery(searchImages.value);}
    b.oncontextmenu=(e)=>{e.preventDefault(); deleteImgCategory(c.id);}
    imgCategoryList.appendChild(b);
  });

  imgModelFilterList.innerHTML='';
  createChip(imgModelFilterList, t('filters.all'), 'all', currentModelFilter, (id)=>{currentModelFilter=id; renderImageGallery(searchImages.value);});
  imgModels.forEach(m=>{ createChip(imgModelFilterList, m, m, currentModelFilter, (id)=>{currentModelFilter=id; renderImageGallery(searchImages.value);}); });
}

function openModelsManager() { modelsManageModal.classList.remove('hidden'); renderModelsList(); }
function renderModelsList() { modelsListContainer.innerHTML=''; imgModels.forEach(m=>{ const d=document.createElement('div'); d.className='model-item'; d.innerHTML=`<span>${m}</span><button class="icon-btn danger small-icon" style="width:20px;height:20px">×</button>`; d.querySelector('button').onclick=async()=>{if(confirm(t('alerts.confirmDeleteModel'))){imgModels=imgModels.filter(x=>x!==m); await chrome.storage.local.set({imgModels}); renderModelsList(); renderImgFilters();}}; modelsListContainer.appendChild(d); }); }
async function addNewModel(){const v=newModelNameInput.value.trim();if(!v)return;if(!imgModels.includes(v)){imgModels.push(v);await chrome.storage.local.set({imgModels});newModelNameInput.value='';renderModelsList();renderImgFilters();}}

async function loadImageLibrary() { 
    const r = await chrome.storage.local.get(['imageLibrary']); 
    imageLibrary = r.imageLibrary || []; 
    imageLibrary.forEach(i => {
        if(!i.categoryId) i.categoryId="";
        if(i.deleted === undefined) i.deleted = false;
        if(!i.steps) i.steps = [];
        i.steps.forEach(s => { 
            if(s.deleted === undefined) s.deleted = false; 
        });
    }); 
    renderImageGallery(); 
}

function renderImageGallery(filter='') {
    imageGalleryGrid.innerHTML=''; const term=filter.toLowerCase().trim();
    
    let sub = imageLibrary.filter(i => !i.deleted);
    if(currentImgCategory==='none') sub=sub.filter(i=>!i.categoryId);
    else if(currentImgCategory!=='all') sub=sub.filter(i=>i.categoryId===currentImgCategory);
    
    if(currentModelFilter!=='all') sub=sub.filter(i=>i.model===currentModelFilter);
    
    // Recherche avancée : titre + prompt + paramètres + label/content des étapes
    const filtered = !term ? sub : sub.filter(i => {
      if (i.title && i.title.toLowerCase().includes(term)) return true;
      if (i.prompt && i.prompt.toLowerCase().includes(term)) return true;
      if (i.params && i.params.toLowerCase().includes(term)) return true;
      if (i.model && i.model.toLowerCase().includes(term)) return true;
      if (i.steps && i.steps.some(s => !s.deleted && (
        (s.label && s.label.toLowerCase().includes(term)) ||
        (s.content && s.content.toLowerCase().includes(term))
      ))) return true;
      return false;
    });
    if(filtered.length===0){imageGalleryGrid.innerHTML='<div class="empty-state" style="grid-column:span 2">Vide</div>';return;}

    filtered.forEach(img => {
        const card = document.createElement('div'); card.className = 'gallery-card'; card.dataset.id=img.id;
        if(selectedIds.has(img.id)) card.classList.add('selected-card');

        let media = '';
        if(img.imgBefore && img.imgAfter) {
          media = `<div class="compare-container"><img src="${img.imgAfter}" class="compare-img img-before"><img src="${img.imgBefore}" class="compare-img img-after"><div class="compare-handle"></div></div>`;
          card.addEventListener('mousemove', (e) => { const r=card.getBoundingClientRect(); const x=Math.max(0,Math.min(e.clientX-r.left,r.width)); card.style.setProperty('--position',`${(x/r.width)*100}%`); });
          card.addEventListener('mouseleave', () => card.style.setProperty('--position', `50%`));
        } else {
          media = `<img src="${img.imgAfter||img.imgBefore||'assets/icon48.png'}" style="width:100%;height:100%;object-fit:cover">`;
        }
        const cnt = (img.steps&&img.steps.filter(s => !s.deleted).length>0)?`<span class="gallery-badge-count">+${img.steps.filter(s => !s.deleted).length}</span>`:'';
        card.innerHTML = `<button class="card-delete-btn danger icon-btn small-icon">&times;</button>${media}${cnt}<div class="gallery-overlay"><div class="gallery-title">${img.title}</div><div class="gallery-model-tag">${img.model}</div></div>`;
        
        card.querySelector('.card-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteImg(img.id);
        });

        card.addEventListener('click', (e) => { if(!toggleSelection(e, img.id, 'image')) showImgDetail(img); });
        imageGalleryGrid.appendChild(card);
    });
    setTimeout(() => window.scrollTo(0, scrollPositions.gallery), 0);
}

function showImgDetail(img) {
  scrollPositions.gallery = window.scrollY;
  currentViewingImgId=img.id; 
  imgGalleryView.classList.add('hidden'); 
  imgDetailView.classList.remove('hidden');
  imgDetailTitle.textContent=img.title; 
  imgDetailModel.textContent=img.model;
  imgShowcase.innerHTML='';
  const hasBothCover = !!(img.imgBefore && img.imgAfter);
  if(img.imgBefore){
    const i=document.createElement('img');
    i.src=img.imgBefore; i.className="showcase-img";
    i.onclick = hasBothCover
      ? () => openLightbox(img.imgBefore, img.imgAfter)
      : () => openLightbox(img.imgBefore);
    imgShowcase.appendChild(i);
  }
  if(img.imgAfter){
    const i=document.createElement('img');
    i.src=img.imgAfter; i.className="showcase-img";
    i.onclick = hasBothCover
      ? () => openLightbox(img.imgBefore, img.imgAfter)
      : () => openLightbox(img.imgAfter);
    imgShowcase.appendChild(i);
  }
  imgDetailPrompt.textContent=img.prompt; 
  imgParamsContainer.classList.toggle('hidden',!img.params); 
  imgDetailParams.textContent=img.params||"";
  imgStepsList.innerHTML='';

  const visibleImgSteps = (img.steps||[]).filter(s => !s.deleted);
  visibleImgSteps.forEach((s, idx)=>{
    const originalIndex = img.steps.findIndex(os => os.id === s.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'step-item-wrapper';
    wrapper.setAttribute('draggable', 'true');
    wrapper.dataset.index = originalIndex;

    const c = document.createElement('div');
    c.className = 'step-card';
    const hasBoth = !!(s.img && s.imgAfter);
    const hasAny = !!(s.img || s.imgAfter);

    // Toolbar de mode visualisation des images d'étape
    let toolbar = '';
    if (hasBoth) {
      toolbar = `<div class="step-img-toolbar">
        <button class="view-mode-btn active" data-mode="side" data-step="${s.id}">Côte à côte</button>
        <button class="view-mode-btn" data-mode="slider" data-step="${s.id}">Slider</button>
      </div>`;
    }

    let imH = '';
    if (hasBoth) {
      imH = `<div class="step-img-container" data-step="${s.id}" data-mode="side">
        <img src="${s.img}" data-role="before" class="img-before">
        <img src="${s.imgAfter}" data-role="after" class="img-after">
      </div>`;
    } else if (hasAny) {
      const url = s.img || s.imgAfter;
      imH = `<div class="step-img-container" data-single="${url}"><img src="${url}"></div>`;
    }

    c.innerHTML=`<div class="step-header"><div><span style="opacity:0.5;cursor:grab">☰</span> <span class="step-badge step">${s.label||`Etape ${idx+1}`}</span></div><div><button class="step-actions-btn edit-img-step">✎</button><button class="step-actions-btn del">&times;</button></div></div>${toolbar}${imH}<div class="prompt-preview">${s.content}</div><button class="copy-prompt-btn">Copier</button>`;
    c.querySelector('.copy-prompt-btn').onclick=(e)=>copyToClipboard(s.content,e.target);
    c.querySelector('.del').onclick=()=>deleteImgStep(s.id);
    c.querySelector('.edit-img-step').onclick=()=>openImgStepModal(s);

    // Bind comportement images : toggle mode + clic ouvre lightbox
    const container = c.querySelector('.step-img-container');
    if (container) {
      if (hasBoth) {
        // Toggle slider/côte à côte
        c.querySelectorAll('.view-mode-btn').forEach(btn => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const mode = btn.dataset.mode;
            c.querySelectorAll('.view-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
            applyStepViewMode(container, mode);
          });
        });
        // Clic sur l'image ouvre le lightbox en mode comparateur (Avant+Après)
        container.addEventListener('click', (ev) => {
          if (ev.target.classList.contains('compare-handle')) return;
          openLightbox(s.img, s.imgAfter);
        });
        applyStepViewMode(container, 'side');
      } else {
        const url = container.dataset.single;
        container.addEventListener('click', () => openLightbox(url));
      }
    }

    wrapper.appendChild(c);
    imgStepsList.appendChild(wrapper);
  });
  enableDragAndDrop(img, 'image');
}

// Bascule du mode d'affichage des images d'une étape
function applyStepViewMode(container, mode) {
  container.dataset.mode = mode;
  if (mode === 'slider') {
    container.classList.add('compare-mode');
    if (!container.querySelector('.compare-handle')) {
      const h = document.createElement('div');
      h.className = 'compare-handle';
      container.appendChild(h);
    }
    container.style.setProperty('--position', '50%');
    // mousemove → déplace le clip
    container.onmousemove = (e) => {
      const r = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
      container.style.setProperty('--position', `${(x / r.width) * 100}%`);
    };
  } else {
    container.classList.remove('compare-mode');
    container.onmousemove = null;
    container.style.removeProperty('--position');
    const h = container.querySelector('.compare-handle');
    if (h) h.remove();
  }
}

function openImgModal(i) {
  imgModal.classList.remove('hidden'); 
  imgModelSelect.innerHTML=''; 
  imgModels.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;imgModelSelect.appendChild(o)}); 
  imgCategorySelect.innerHTML='<option value="">(Aucun)</option>'; 
  imgCategories.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;imgCategorySelect.appendChild(o)}); 
  document.getElementById('previewBefore').src=''; 
  document.getElementById('previewBefore').classList.add('hidden'); 
  document.getElementById('previewAfter').src=''; 
  document.getElementById('previewAfter').classList.add('hidden'); 
  document.querySelectorAll('.remove-img-btn').forEach(b=>b.classList.add('hidden')); 
  if(i){ 
      imgEditId.value=i.id; 
      imgNameInput.value=i.title; 
      imgCategorySelect.value=i.categoryId||""; 
      imgModelSelect.value=i.model; 
      imgPromptInput.value=i.prompt; 
      imgParamsInput.value=i.params||""; 
      if(i.imgBefore) setPreview('previewBefore',i.imgBefore); 
      if(i.imgAfter) setPreview('previewAfter',i.imgAfter); 
  } else { 
      imgEditId.value=""; 
      imgNameInput.value=""; 
      imgCategorySelect.value=(currentImgCategory!=='all'&&currentImgCategory!=='none')?currentImgCategory:""; 
      imgPromptInput.value=""; 
      imgParamsInput.value=""; 
  } 
}

async function saveImg() {
  const id=imgEditId.value, ti=imgNameInput.value.trim(), cat=imgCategorySelect.value, mo=imgModelSelect.value, pr=imgPromptInput.value.trim(), pa=imgParamsInput.value.trim();
  const existing = id ? imageLibrary.find(i=>i.id===id) : null;
  const ib = getPreviewValue('previewBefore', existing?.imgBefore);
  const ia = getPreviewValue('previewAfter', existing?.imgAfter);
  if(!ti) return alert(t('alerts.missingTitle'));
  if(id){
      const idx=imageLibrary.findIndex(x=>x.id===id);
      if(idx!==-1){
          imageLibrary[idx]={...imageLibrary[idx],title:ti,categoryId:cat,model:mo,prompt:pr,params:pa,imgBefore:ib,imgAfter:ia};
          if(currentViewingImgId===id) showImgDetail(imageLibrary[idx]);
      }
  } else {
      imageLibrary.unshift({id:`i_${Date.now()}`,title:ti,categoryId:cat,model:mo,prompt:pr,params:pa,imgBefore:ib,imgAfter:ia,steps:[],deleted:false});
  }
  await chrome.storage.local.set({imageLibrary});
  imgModal.classList.add('hidden');
  if(!currentViewingImgId) renderImageGallery(searchImages.value);
}

function openImgStepModal(s){
    imgStepModal.classList.remove('hidden');
    document.getElementById('imgStepEditId').value = s ? s.id : '';
    document.getElementById('imgStepLabel').value = s ? s.label : '';
    document.getElementById('imgStepContent').value = s ? s.content : '';
    setPreview('previewStep', s && s.img ? s.img : '');
    setPreview('previewStepAfter', s && s.imgAfter ? s.imgAfter : '');
}

async function saveImgStep(){
    const img=imageLibrary.find(x=>x.id===currentViewingImgId);if(!img)return;
    const id = document.getElementById('imgStepEditId').value;
    const l=document.getElementById('imgStepLabel').value,c=document.getElementById('imgStepContent').value;
    const existingStep = id ? img.steps.find(s=>s.id===id) : null;
    const im = getPreviewValue('previewStep', existingStep?.img);
    const imAfter = getPreviewValue('previewStepAfter', existingStep?.imgAfter);

    if(!c)return;

    if(id){ // Editing existing step
        const step = img.steps.find(s => s.id === id);
        if(step){
            step.label = l;
            step.content = c;
            step.img = im;
            step.imgAfter = imAfter;
        }
    } else { // New step
        img.steps.push({id:`is_${Date.now()}`,label:l,content:c,img:im, imgAfter: imAfter, deleted: false});
    }

    await chrome.storage.local.set({imageLibrary});
    imgStepModal.classList.add('hidden');
    showImgDetail(img);
}

async function deleteImg(id) {
    if(!confirm(t('alerts.confirmTrashImage'))) return;
    const img = imageLibrary.find(i => i.id === id);
    if(img) {
        img.deleted = true;
        await chrome.storage.local.set({ imageLibrary });
        renderImageGallery(searchImages.value);
    }
}

async function deleteCurrentImg() {
    if(!currentViewingImgId) return;
    deleteImg(currentViewingImgId);
    showImgGallery();
}

async function deleteImgStep(id){
    if(!confirm(t('alerts.confirmDeleteStep')))return;
    const img=imageLibrary.find(x=>x.id===currentViewingImgId);
    if(img){
        const step = img.steps.find(s => s.id === id);
        if (step) step.deleted = true;
        await chrome.storage.local.set({imageLibrary});
        showImgDetail(img);
    }
}

function autoSuggestTags(text, existingTags) {
    const suggestions = {
        'midjourney': ['midjourney', 'image', 'generation'],
        'python': ['python', 'code', 'script'],
        'retouche': ['retouche', 'photoshop', 'image'],
    };
    let suggestedTags = new Set(existingTags);
    for (const keyword in suggestions) {
        if (text.toLowerCase().includes(keyword)) {
            suggestions[keyword].forEach(tag => suggestedTags.add(tag));
        }
    }
    gptTagsInput.value = Array.from(suggestedTags).join(', ');
}

// Utils
// openLightbox peut être appelé avec :
//   - openLightbox(url)                          → image simple
//   - openLightbox(urlBefore, urlAfter)          → mode comparateur slider
function openLightbox(src, srcAfter) {
  const compareMode = !!(src && srcAfter);
  const stage = document.getElementById('lightboxStage');
  const single = document.getElementById('lightboxImg');
  const compare = document.getElementById('lightboxCompare');
  const before = document.getElementById('lightboxCompareBefore');
  const after = document.getElementById('lightboxCompareAfter');

  if (compareMode) {
    single.classList.add('hidden');
    compare.classList.remove('hidden');
    before.src = src;
    after.src = srcAfter;
    compare.style.setProperty('--lbpos', '50%');
  } else {
    compare.classList.add('hidden');
    single.classList.remove('hidden');
    single.src = src;
  }

  lightboxZoom = 1;
  lightboxPan = { x: 0, y: 0 };
  applyLightboxTransform();
  lightboxModal.classList.remove('hidden');
}
function applyLightboxTransform() {
  lightboxImg.style.transform = `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom})`;
  const info = document.getElementById('lightboxZoomLevel');
  if (info) info.textContent = `${Math.round(lightboxZoom * 100)}%`;
}
function setupLightboxZoom() {
  const stage = document.getElementById('lightboxStage');
  const btnIn = document.getElementById('btnLightboxZoomIn');
  const btnOut = document.getElementById('btnLightboxZoomOut');
  const btnReset = document.getElementById('btnLightboxReset');
  if (!stage) return;

  btnIn.addEventListener('click', (e) => { e.stopPropagation(); lightboxZoom = Math.min(8, lightboxZoom * 1.25); applyLightboxTransform(); });
  btnOut.addEventListener('click', (e) => { e.stopPropagation(); lightboxZoom = Math.max(0.25, lightboxZoom / 1.25); applyLightboxTransform(); });
  btnReset.addEventListener('click', (e) => { e.stopPropagation(); lightboxZoom = 1; lightboxPan = {x:0,y:0}; applyLightboxTransform(); });

  // Molette = zoom
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 0.87;
    lightboxZoom = Math.max(0.25, Math.min(8, lightboxZoom * delta));
    applyLightboxTransform();
  }, { passive: false });

  // Drag pour panner quand on est zoomé (sur l'image simple uniquement)
  stage.addEventListener('mousedown', (e) => {
    const compare = document.getElementById('lightboxCompare');
    if (!compare.classList.contains('hidden')) return; // pas de pan en mode comparateur
    if (lightboxZoom <= 1) return;
    e.preventDefault();
    lightboxDragging = true;
    lightboxDragStart = { x: e.clientX - lightboxPan.x, y: e.clientY - lightboxPan.y };
  });
  window.addEventListener('mousemove', (e) => {
    if (!lightboxDragging) return;
    lightboxPan.x = e.clientX - lightboxDragStart.x;
    lightboxPan.y = e.clientY - lightboxDragStart.y;
    applyLightboxTransform();
  });
  window.addEventListener('mouseup', () => { lightboxDragging = false; });

  // Mode comparateur : déplacer la séparation en suivant la souris
  const compare = document.getElementById('lightboxCompare');
  compare.addEventListener('mousemove', (e) => {
    const r = compare.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
    compare.style.setProperty('--lbpos', `${(x / r.width) * 100}%`);
  });

  // Double-clic reset
  stage.addEventListener('dblclick', () => {
    lightboxZoom = lightboxZoom === 1 ? 2 : 1;
    if (lightboxZoom === 1) lightboxPan = { x: 0, y: 0 };
    applyLightboxTransform();
  });
}
function copyToClipboard(t,b){navigator.clipboard.writeText(t).then(()=>{const o=b.textContent;b.textContent="OK";b.style.background="#10a37f";setTimeout(()=>{b.textContent=o;b.style.background=""},1000)})}
function setPreview(eid,s){
  const e=document.getElementById(eid); if(!e) return;
  const btn = document.querySelector(`button[data-target="${eid}"]`);
  if(s){
    e.src=s; e.classList.remove('hidden');
    e.dataset.cleared = '';
    if(btn) btn.classList.remove('hidden');
  } else {
    e.src=''; e.classList.add('hidden');
    e.dataset.cleared = '';   // pas effacé manuellement, juste pas d'image
    if(btn) btn.classList.add('hidden');
  }
}
// Récupère la valeur d'image d'un preview pour la sauvegarde.
// Retourne :
//   - data:... si l'utilisateur a chargé une image
//   - "" si l'utilisateur a explicitement supprimé l'image (croix)
//   - fallback si le preview n'a pas été touché (édition d'un item existant)
function getPreviewValue(eid, fallback) {
  const e = document.getElementById(eid);
  if (!e) return fallback || "";
  if (e.dataset.cleared === '1') return ""; // explicitement supprimée
  if (e.src && e.src.startsWith('data:')) return e.src;
  return fallback || "";
}
function setupDropZone(dz,pid){
  if(!dz) return;
  const fi=dz.querySelector('.hidden-file'),rb=dz.querySelector('.remove-img-btn'),pr=document.getElementById(pid);
  dz.onclick=(e)=>{ if(e.target!==rb && !e.target.closest('.remove-img-btn')) fi.click(); };
  rb.onclick=(e)=>{
    e.stopPropagation();
    pr.src=''; pr.classList.add('hidden');
    rb.classList.add('hidden');
    fi.value='';
    pr.dataset.cleared = '1'; // marque la suppression explicite
  };
  fi.onchange=()=>{ handleFiles(fi.files,pr,rb); pr.dataset.cleared=''; };
  dz.ondragover=e=>{e.preventDefault();dz.style.borderColor='#10a37f'};
  dz.ondragleave=e=>{e.preventDefault();dz.style.borderColor='#565869'};
  dz.ondrop=e=>{e.preventDefault();dz.style.borderColor='#565869';handleFiles(e.dataTransfer.files,pr,rb); pr.dataset.cleared='';};
}
function handleFiles(fs,pr,btn){if(fs&&fs[0])resizeImage(fs[0],800).then(b=>{pr.src=b;pr.classList.remove('hidden');btn.classList.remove('hidden')});}
function resizeImage(f,mw){return new Promise(r=>{const rd=new FileReader();rd.onload=e=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');let w=i.width,h=i.height;if(w>mw){h=Math.round(h*mw/w);w=mw}c.width=w;c.height=h;c.getContext('2d').drawImage(i,0,0,w,h);r(c.toDataURL('image/jpeg',0.7))};i.src=e.target.result};rd.readAsDataURL(f)})}

function showImgGallery() {
  document.getElementById('imgDetailView').classList.add('hidden');
  document.getElementById('imgGalleryView').classList.remove('hidden');
  currentViewingImgId = null;
  renderImageGallery(document.getElementById('searchImages').value);
}

// =========================================================
// 8. NOUVELLES FONCTIONNALITÉS v3.5
// =========================================================

// --- Vue grille/liste pour la bibliothèque GPTs ---
function applyGptViewMode() {
  if (gptViewMode === 'grid') {
    libraryList.classList.add('grid-mode');
    libraryList.style.gridTemplateColumns = `repeat(${gptZoomLevel}, 1fr)`;
    document.getElementById('gptZoomSlider').style.display = '';
  } else {
    libraryList.classList.remove('grid-mode');
    libraryList.style.gridTemplateColumns = '';
    document.getElementById('gptZoomSlider').style.display = 'none';
  }
  // Mettre à jour l'icône du toggle
  const btn = document.getElementById('btnGptViewToggle');
  if (btn) btn.textContent = (gptViewMode === 'grid') ? '☰' : '▦';
  // Re-render si la liste est visible
  if (libraryListView && !libraryListView.classList.contains('hidden')) {
    renderLibrary(searchLibrary.value);
  }
}

// --- Création rapide de dossier depuis le modal d'édition GPT ---
async function quickCreateFolder() {
  const name = prompt("Nom du nouveau dossier :");
  if (!name || !name.trim()) return;
  const folder = { id: `f_${Date.now()}`, name: name.trim() };
  folders.push(folder);
  await chrome.storage.local.set({ folders });
  // Reconstruire le sélecteur et sélectionner automatiquement le nouveau dossier
  const sel = document.getElementById('gptFolderSelect');
  const o = document.createElement('option');
  o.value = folder.id;
  o.textContent = folder.name;
  sel.appendChild(o);
  sel.value = folder.id;
  renderFoldersBar();
}

// --- Batch tags ---
function openBulkTagsModal() {
  if (selectionMode !== 'text') {
    alert(t('alerts.bulkTagsTextOnly'));
    return;
  }
  document.getElementById('bulkTagsInput').value = '';
  document.getElementById('bulkTagsMode').value = 'add';
  document.getElementById('bulkTagsModal').classList.remove('hidden');
}

async function confirmBulkTags() {
  const mode = document.getElementById('bulkTagsMode').value;
  const raw = document.getElementById('bulkTagsInput').value;
  const tagsArr = raw.split(',').map(t => t.trim()).filter(t => t);
  if (tagsArr.length === 0 && mode !== 'replace') {
    return alert(t('alerts.noTagsProvided'));
  }
  gptLibrary.forEach(g => {
    if (!selectedIds.has(g.id)) return;
    const current = new Set(g.tags || []);
    if (mode === 'add') {
      tagsArr.forEach(t => current.add(t));
    } else if (mode === 'remove') {
      tagsArr.forEach(t => current.delete(t));
    } else if (mode === 'replace') {
      current.clear();
      tagsArr.forEach(t => current.add(t));
    }
    g.tags = Array.from(current);
  });
  await chrome.storage.local.set({ gptLibrary });
  document.getElementById('bulkTagsModal').classList.add('hidden');
  renderLibrary(searchLibrary.value);
  clearSelection();
}

// --- Export partiel de la sélection ---
async function exportSelection() {
  if (selectedIds.size === 0) return alert(t('alerts.nothingSelected'));
  const payload = { __partial: true, exportedAt: new Date().toISOString(), mode: selectionMode };
  if (selectionMode === 'text') {
    payload.gptLibrary = gptLibrary.filter(g => selectedIds.has(g.id));
    // Inclure les dossiers référencés pour conserver l'organisation
    const folderIds = new Set(payload.gptLibrary.map(g => g.folderId).filter(Boolean));
    payload.folders = folders.filter(f => folderIds.has(f.id));
  } else if (selectionMode === 'image') {
    payload.imageLibrary = imageLibrary.filter(i => selectedIds.has(i.id));
    const catIds = new Set(payload.imageLibrary.map(i => i.categoryId).filter(Boolean));
    payload.imgCategories = imgCategories.filter(c => catIds.has(c.id));
  }
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai_master_selection_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Import partiel (fusion, pas écrasement) ---
async function importPartial(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      // Détecter export complet ou partiel
      let countGpt = 0, countImg = 0, countFolders = 0, countCats = 0;

      // Fusion GPTs
      if (Array.isArray(data.gptLibrary)) {
        const existingIds = new Set(gptLibrary.map(g => g.id));
        data.gptLibrary.forEach(g => {
          if (existingIds.has(g.id)) {
            // Ré-attribuer un nouvel ID en cas de collision
            g.id = `g_${Date.now()}_${Math.floor(Math.random()*1000)}`;
          }
          gptLibrary.unshift(g);
          countGpt++;
        });
      }
      // Fusion dossiers
      if (Array.isArray(data.folders)) {
        const existingFids = new Set(folders.map(f => f.id));
        data.folders.forEach(f => {
          if (!existingFids.has(f.id)) { folders.push(f); countFolders++; }
        });
      }
      // Fusion images
      if (Array.isArray(data.imageLibrary)) {
        const existingIds = new Set(imageLibrary.map(i => i.id));
        data.imageLibrary.forEach(i => {
          if (existingIds.has(i.id)) {
            i.id = `i_${Date.now()}_${Math.floor(Math.random()*1000)}`;
          }
          imageLibrary.unshift(i);
          countImg++;
        });
      }
      if (Array.isArray(data.imgCategories)) {
        const existing = new Set(imgCategories.map(c => c.id));
        data.imgCategories.forEach(c => {
          if (!existing.has(c.id)) { imgCategories.push(c); countCats++; }
        });
      }

      await chrome.storage.local.set({ gptLibrary, folders, imageLibrary, imgCategories });
      alert(t('alerts.importDone', { gpt: countGpt, img: countImg, folders: countFolders, cats: countCats }));
      renderFoldersBar();
      renderLibrary(searchLibrary.value);
      renderImgFilters();
      renderImageGallery(searchImages.value);
    } catch (err) {
      alert(t('alerts.invalidFile') + err.message);
    }
    e.target.value = ''; // reset pour pouvoir réimporter le même fichier
  };
  reader.readAsText(file);
}

// --- Drop global sur le modal image (drag rapide) ---
function setupModalGlobalDrop() {
  const modal = document.getElementById('imgModal');
  if (!modal) return;
  const content = modal.querySelector('.modal-content');

  // dragenter + dragover doivent absolument preventDefault sur TOUS les éléments
  // sinon le drop ne se déclenchera pas
  const stopAndShow = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    content.classList.add('drag-active');
  };
  modal.addEventListener('dragenter', stopAndShow);
  modal.addEventListener('dragover', stopAndShow);
  modal.addEventListener('dragleave', (e) => {
    // Ne désactive le surlignage que si on quitte vraiment le modal (pas juste un enfant)
    if (!modal.contains(e.relatedTarget)) {
      content.classList.remove('drag-active');
    }
  });
  modal.addEventListener('drop', (e) => {
    // Si la drop a atterri directement sur une dropzone, on laisse faire le handler natif
    if (e.target.closest('.drop-zone')) {
      content.classList.remove('drag-active');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    content.classList.remove('drag-active');
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const beforeImg = document.getElementById('previewBefore');
    const afterImg = document.getElementById('previewAfter');
    const beforeBtn = document.querySelector('button[data-target="previewBefore"]');
    const afterBtn = document.querySelector('button[data-target="previewAfter"]');
    const beforeEmpty = beforeImg.classList.contains('hidden') || !beforeImg.src.startsWith('data:');
    if (beforeEmpty) {
      handleFiles([files[0]], beforeImg, beforeBtn);
      beforeImg.dataset.cleared = '';
      if (files[1]) { handleFiles([files[1]], afterImg, afterBtn); afterImg.dataset.cleared = ''; }
    } else {
      handleFiles([files[0]], afterImg, afterBtn);
      afterImg.dataset.cleared = '';
    }
  });
}

// =========================================================
// 9. RACCOURCIS CLAVIER GLOBAUX
// =========================================================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Détecter si on est dans un input/textarea (pour ne pas intercepter la frappe)
    const target = e.target;
    const isTyping = target.matches('input, textarea') ||
                     target.isContentEditable;

    // Échap : ferme la modale ouverte, sinon désélectionne
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal-overlay:not(.hidden)');
      if (openModal) {
        // Fermer la modale la plus récente
        openModal.classList.add('hidden');
        e.preventDefault();
        return;
      }
      if (selectedIds.size > 0) {
        clearSelection();
        e.preventDefault();
      }
      return;
    }

    // ? : ouvrir le pense-bête (hors champ de saisie)
    if (!isTyping && (e.key === '?')) {
      e.preventDefault();
      document.getElementById('shortcutsModal').classList.remove('hidden');
      return;
    }

    // Ctrl+A : tout sélectionner dans l'onglet actif (hors champ de saisie)
    if (!isTyping && (e.ctrlKey || e.metaKey) && e.key === 'a') {
      const active = document.querySelector('.tab-content.active');
      if (active && (active.id === 'view-library' || active.id === 'view-images')) {
        // Seulement si on est en vue liste/galerie (pas en détail)
        const inDetailGpt = !gptDetailView.classList.contains('hidden');
        const inDetailImg = !document.getElementById('imgDetailView').classList.contains('hidden');
        if (!inDetailGpt && !inDetailImg) {
          e.preventDefault();
          selectAllVisible();
        }
      }
      return;
    }

    // Ctrl+F : focus recherche
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      const active = document.querySelector('.tab-content.active');
      if (!active) return;
      let inputId = null;
      if (active.id === 'view-library') inputId = 'searchLibrary';
      else if (active.id === 'view-images') inputId = 'searchImages';
      if (inputId) {
        e.preventDefault();
        const el = document.getElementById(inputId);
        el.focus();
        el.select();
      }
      return;
    }

    // Ctrl+N : nouveau prompt / image selon l'onglet
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      const active = document.querySelector('.tab-content.active');
      if (!active) return;
      if (active.id === 'view-library' && libraryListView && !libraryListView.classList.contains('hidden')) {
        e.preventDefault();
        openMainModal();
      } else if (active.id === 'view-images') {
        const inDetail = !document.getElementById('imgDetailView').classList.contains('hidden');
        if (!inDetail) {
          e.preventDefault();
          openImgModal();
        }
      }
      return;
    }

    // Ctrl+1/2/3 : changer d'onglet
    if ((e.ctrlKey || e.metaKey) && (e.key === '1' || e.key === '2' || e.key === '3')) {
      e.preventDefault();
      const map = { '1': 'view-splitter', '2': 'view-library', '3': 'view-images' };
      const targetId = map[e.key];
      const btn = document.querySelector(`.tab-btn[data-target="${targetId}"]`);
      if (btn) btn.click();
      return;
    }

    // Suppr : supprimer la sélection
    if (!isTyping && e.key === 'Delete' && selectedIds.size > 0) {
      e.preventDefault();
      deleteSelectedItems();
      return;
    }
  });
}

init();
