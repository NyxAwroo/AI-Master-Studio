/**
 * AI MASTER STUDIO PRO - PANEL.JS
 * v3.6 : Internationalization (FR / EN, et système ouvert pour d'autres langues
 *        via simples fichiers JSON dans src/locales/).
 * v3.5 : Vue grille GPTs, recherche avancée, lightbox zoom, comparateur étapes,
 *        batch tags/export, raccourci nouveau dossier dans modal édition.
 */
// --- BRIDGE TAURI STORE ---
import { LazyStore } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';

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
  try { updateSplitterCounter(); } catch (e) { /* idem */ }
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
          const allKeys = ['gptLibrary', 'folders', 'imageLibrary', 'imgModels', 'imgCategories', 'customPresets', 'imageZoomLevel', 'gptViewMode', 'gptZoomLevel', 'gptSortMode', 'imgSortMode', 'gptSearchMode', 'imgSearchMode', 'appLanguage', 'localAiSettings'];
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
const DEFAULT_LOCAL_AI = {
  provider: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  lmstudioUrl: 'http://localhost:1234',
  apiToken: '',
  model: '',
  instanceId: '',
  enableClean: false,
  autoNameSteps: false
};

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
let gptSortMode = 'updated_desc';
let imgSortMode = 'updated_desc';
let gptSearchMode = 'advanced';
let imgSearchMode = 'advanced';
let keyboardShortcutsReady = false;
let localAiSettings = { ...DEFAULT_LOCAL_AI };
let localAiModels = [];
let pendingSuggestedTags = [];
// Lightbox zoom state
let lightboxZoom = 1;
let lightboxPan = { x: 0, y: 0 };
let lightboxDragging = false;
let lightboxDragStart = { x: 0, y: 0 };
let lightboxItems = [];
let lightboxIndex = -1;
let pendingMoveStepId = null;
let keyboardFocusedGptId = null;
let processingItems = new Set();
let finderState = { open: false, type: null, query: '', matches: [], index: 0 };
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
const btnBulkModel = document.getElementById('btnBulkModel');
const btnBulkDelete = document.getElementById('btnBulkDelete');
const btnBulkCancel = document.getElementById('btnBulkCancel');
const btnBulkAiClean = document.getElementById('btnBulkAiClean');
const btnBulkAiTags = document.getElementById('btnBulkAiTags');
const btnBulkAiNotes = document.getElementById('btnBulkAiNotes');
const btnScrapePage = document.getElementById('btnScrapePage');
const scrapeUrlInput = document.getElementById('scrapeUrlInput');
const modelSelect = document.getElementById('modelSelect');
const customLimitInput = document.getElementById('customLimit');
const newPresetName = document.getElementById('newPresetName');
const btnSavePreset = document.getElementById('btnSavePreset');
const btnDeletePreset = document.getElementById('btnDeletePreset');
const inputText = document.getElementById('inputText');
const splitterCounter = document.getElementById('splitterCounter');
const splitterCounterBar = document.getElementById('splitterCounterBar');
const btnSplit = document.getElementById('btnSplit');
const btnCleanSplitter = document.getElementById('btnCleanSplitter');
const btnClear = document.getElementById('btnClear');
const resultsArea = document.getElementById('resultsArea');
const libraryListView = document.getElementById('libraryListView');
const gptDetailView = document.getElementById('gptDetailView');
const libraryList = document.getElementById('libraryList');
const searchLibrary = document.getElementById('searchLibrary');
const gptSortSelect = document.getElementById('gptSortSelect');
const gptSearchModeSelect = document.getElementById('gptSearchModeSelect');
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
const imgSortSelect = document.getElementById('imgSortSelect');
const imgSearchModeSelect = document.getElementById('imgSearchModeSelect');
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
const moveStepModal = document.getElementById('moveStepModal');
const bulkModelModal = document.getElementById('bulkModelModal');
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
const btnEmptyImageTrash = document.getElementById('btnEmptyImageTrash');
const fileImportJSON = document.getElementById('fileImportJSON');
const localAiProviderSelect = document.getElementById('localAiProvider');
const localAiBaseUrlInput = document.getElementById('localAiBaseUrl');
const localAiTokenInput = document.getElementById('localAiToken');
const localAiModelSelect = document.getElementById('localAiModelSelect');
const btnRefreshLocalModels = document.getElementById('btnRefreshLocalModels');
const btnLoadLocalModel = document.getElementById('btnLoadLocalModel');
const btnUnloadLocalModel = document.getElementById('btnUnloadLocalModel');
const localAiStatus = document.getElementById('localAiStatus');
const enableCleanPromptToggle = document.getElementById('enableClean');
const autoNameStepsToggle = document.getElementById('autoNameSteps');
const bulkMoveSelect = document.getElementById('bulkMoveSelect');
const btnConfirmBulkMove = document.getElementById('btnConfirmBulkMove');
const moveStepSelect = document.getElementById('moveStepSelect');
const btnConfirmMoveStep = document.getElementById('btnConfirmMoveStep');
const bulkModelSelect = document.getElementById('bulkModelSelect');
const btnConfirmBulkModel = document.getElementById('btnConfirmBulkModel');
const autoNameImportSteps = document.getElementById('autoNameImportSteps');
const autoNameImportStepsImg = document.getElementById('autoNameImportStepsImg');
const editIdInput = document.getElementById('editId');
const gptNameInput = document.getElementById('gptName');
const gptFolderSelect = document.getElementById('gptFolderSelect');
const gptTagsInput = document.getElementById('gptTags');
const gptNoteInput = document.getElementById('gptNote');
const gptPromptInput = document.getElementById('gptPrompt');
const btnSaveGPT = document.getElementById('btnSaveGPT');
const btnSuggestTags = document.getElementById('btnSuggestTags');
const btnGenerateNote = document.getElementById('btnGenerateNote');
const suggestedTagsBox = document.getElementById('suggestedTagsBox');
const suggestedTagsText = document.getElementById('suggestedTagsText');
const btnApplySuggestedTags = document.getElementById('btnApplySuggestedTags');
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
const imgTagsInput = document.getElementById('imgTagsInput');
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

    const data = await chrome.storage.local.get(['imageZoomLevel', 'gptViewMode', 'gptZoomLevel', 'gptSortMode', 'imgSortMode', 'gptSearchMode', 'imgSearchMode', 'appLanguage', 'localAiSettings']);

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
    if (data.gptSortMode) gptSortMode = data.gptSortMode;
    if (data.imgSortMode) imgSortMode = data.imgSortMode;
    if (data.gptSearchMode) gptSearchMode = data.gptSearchMode;
    if (data.imgSearchMode) imgSearchMode = data.imgSearchMode;
    localAiSettings = normalizeLocalAiSettings(data.localAiSettings);
    syncLocalAiControls();
    if (gptSortSelect) gptSortSelect.value = gptSortMode;
    if (imgSortSelect) imgSortSelect.value = imgSortMode;
    if (gptSearchModeSelect) gptSearchModeSelect.value = gptSearchMode;
    if (imgSearchModeSelect) imgSearchModeSelect.value = imgSearchMode;
    applyGptViewMode();
  } catch (erreur) {
    // Si Tauri bloque la base de données, on l'attrape ici au lieu de faire planter l'app !
    console.error("🚨 ERREUR DE CHARGEMENT DES DONNÉES :", erreur);
  }
}

function setupShortcuts() {
  setupKeyboardShortcuts();
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

function normalizeLocalAiSettings(settings = {}) {
  const merged = { ...DEFAULT_LOCAL_AI, ...(settings || {}) };
  if (settings?.enableClean === undefined) merged.enableClean = settings?.enableCleanPrompt !== undefined ? !!settings.enableCleanPrompt : !!merged.model;
  merged.autoNameSteps = !!merged.autoNameSteps;
  delete merged.enableCleanPrompt;
  return merged;
}

function getLocalAiBaseUrl(provider = localAiSettings.provider) {
  return provider === 'lmstudio' ? localAiSettings.lmstudioUrl : localAiSettings.ollamaUrl;
}

function syncLocalAiControls() {
  if (!localAiProviderSelect) return;
  localAiProviderSelect.value = localAiSettings.provider;
  localAiBaseUrlInput.value = getLocalAiBaseUrl();
  localAiTokenInput.value = localAiSettings.apiToken || '';
  if (enableCleanPromptToggle) enableCleanPromptToggle.checked = !!localAiSettings.enableClean;
  if (autoNameStepsToggle) autoNameStepsToggle.checked = !!localAiSettings.autoNameSteps;
  updateCleanPromptButtons();
  renderLocalAiModels();
}

async function persistLocalAiSettings() {
  await chrome.storage.local.set({ localAiSettings });
}

function updateLocalAiSettingsFromControls() {
  if (!localAiProviderSelect) return;
  localAiSettings.provider = localAiProviderSelect.value;
  if (localAiSettings.provider === 'lmstudio') localAiSettings.lmstudioUrl = localAiBaseUrlInput.value.trim() || DEFAULT_LOCAL_AI.lmstudioUrl;
  else localAiSettings.ollamaUrl = localAiBaseUrlInput.value.trim() || DEFAULT_LOCAL_AI.ollamaUrl;
  localAiSettings.apiToken = localAiTokenInput.value.trim();
  localAiSettings.model = localAiModelSelect.value || localAiSettings.model || '';
  const selected = localAiModels.find(m => m.id === localAiSettings.model);
  localAiSettings.instanceId = selected?.instance_id || '';
  if (enableCleanPromptToggle) localAiSettings.enableClean = enableCleanPromptToggle.checked;
  if (autoNameStepsToggle) localAiSettings.autoNameSteps = autoNameStepsToggle.checked;
}

function renderLocalAiModels() {
  if (!localAiModelSelect) return;
  localAiModelSelect.innerHTML = '';
  if (!localAiModels.length) {
    const opt = document.createElement('option');
    opt.value = localAiSettings.model || '';
    opt.textContent = localAiSettings.model || t('settings.localAiNoModel');
    localAiModelSelect.appendChild(opt);
    return;
  }
  localAiModels.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model.id;
    opt.textContent = `${model.loaded ? '● ' : ''}${model.name || model.id}`;
    localAiModelSelect.appendChild(opt);
  });
  if (localAiModels.some(m => m.id === localAiSettings.model)) {
    localAiModelSelect.value = localAiSettings.model;
  } else {
    localAiModelSelect.value = localAiModels[0].id;
    localAiSettings.model = localAiModels[0].id;
    localAiSettings.instanceId = localAiModels[0].instance_id || '';
  }
}

function ensureGptAiHelpers() {
  if (document.getElementById('btnImprovePrompt')) return;
  const promptLabel = document.querySelector('label[data-i18n="modal.gpt.prompt"]');
  if (!promptLabel) return;
  const noteRow = btnGenerateNote?.closest('.field-label-row');
  if (noteRow && !document.getElementById('btnCleanNote')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btnCleanNote';
    btn.className = 'secondary tiny-btn';
    btn.setAttribute('data-i18n', 'modal.gpt.cleanNote');
    btn.textContent = t('modal.gpt.cleanNote');
    btn.addEventListener('click', cleanNoteWithLocalAi);
    noteRow.appendChild(btn);
  }
  const row = document.createElement('div');
  row.className = 'field-label-row';
  row.innerHTML = `<span data-i18n="modal.gpt.prompt">${t('modal.gpt.prompt')}</span><div class="inline-actions"><button type="button" id="btnCleanPrompt" class="secondary tiny-btn" data-i18n="modal.gpt.clean">${t('modal.gpt.clean')}</button><button type="button" id="btnImprovePrompt" class="secondary tiny-btn" data-i18n="modal.gpt.improve">${t('modal.gpt.improve')}</button></div>`;
  promptLabel.replaceWith(row);
  const warning = document.createElement('div');
  warning.id = 'duplicateWarning';
  warning.className = 'ai-suggestion duplicate-warning hidden';
  gptPromptInput.insertAdjacentElement('afterend', warning);
  document.getElementById('btnImprovePrompt').addEventListener('click', improvePromptWithLocalAi);
  document.getElementById('btnCleanPrompt').addEventListener('click', cleanPromptWithLocalAi);
  updateCleanPromptButtons();
}

function ensureStepCleanHelpers() {
  const existingStepBtn = document.getElementById('btnCleanStepPrompt');
  if (existingStepBtn && !existingStepBtn.dataset.bound) {
    existingStepBtn.addEventListener('click', cleanStepPromptWithLocalAi);
    existingStepBtn.dataset.bound = '1';
  }
  const existingImgStepBtn = document.getElementById('btnCleanImgStepPrompt');
  if (existingImgStepBtn && !existingImgStepBtn.dataset.bound) {
    existingImgStepBtn.addEventListener('click', cleanImgStepPromptWithLocalAi);
    existingImgStepBtn.dataset.bound = '1';
  }
  const stepPromptLabel = document.querySelector('label[data-i18n="modal.step.prompt"]');
  if (stepPromptLabel && !document.getElementById('btnCleanStepPrompt')) {
    const row = document.createElement('div');
    row.className = 'field-label-row';
    row.innerHTML = `<span data-i18n="modal.step.prompt">${t('modal.step.prompt')}</span><button type="button" id="btnCleanStepPrompt" class="secondary tiny-btn" data-i18n="modal.gpt.clean">${t('modal.gpt.clean')}</button>`;
    stepPromptLabel.replaceWith(row);
    const btn = document.getElementById('btnCleanStepPrompt');
    btn.addEventListener('click', cleanStepPromptWithLocalAi);
    btn.dataset.bound = '1';
  }
  const imgStepPromptLabel = document.querySelector('label[data-i18n="modal.imgStep.prompt"]');
  if (imgStepPromptLabel && !document.getElementById('btnCleanImgStepPrompt')) {
    const row = document.createElement('div');
    row.className = 'field-label-row';
    row.innerHTML = `<span data-i18n="modal.imgStep.prompt">${t('modal.imgStep.prompt')}</span><button type="button" id="btnCleanImgStepPrompt" class="secondary tiny-btn" data-i18n="modal.gpt.clean">${t('modal.gpt.clean')}</button>`;
    imgStepPromptLabel.replaceWith(row);
    const btn = document.getElementById('btnCleanImgStepPrompt');
    btn.addEventListener('click', cleanImgStepPromptWithLocalAi);
    btn.dataset.bound = '1';
  }
  updateCleanPromptButtons();
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

  btnOpenSettings.addEventListener('click', () => {
    syncLocalAiControls();
    settingsModal.classList.remove('hidden');
    refreshLocalAiModels(false);
  });
  document.getElementById('btnCloseSettings').addEventListener('click', () => settingsModal.classList.add('hidden'));
  btnExportJSON.addEventListener('click', exportBackup);
  btnImportJSON.addEventListener('click', importBackup);
  if (btnEmptyImageTrash) btnEmptyImageTrash.addEventListener('click', emptyImageTrash);
  const btnEmptyGptTrash = document.getElementById('btnEmptyGptTrash');
  if (btnEmptyGptTrash) btnEmptyGptTrash.addEventListener('click', emptyGptTrash);
  if (localAiProviderSelect) {
    localAiProviderSelect.addEventListener('change', async () => {
      localAiSettings.provider = localAiProviderSelect.value;
      localAiBaseUrlInput.value = getLocalAiBaseUrl();
      localAiModels = [];
      renderLocalAiModels();
      await persistLocalAiSettings();
    });
    localAiBaseUrlInput.addEventListener('change', async () => { updateLocalAiSettingsFromControls(); await persistLocalAiSettings(); });
    localAiTokenInput.addEventListener('change', async () => { updateLocalAiSettingsFromControls(); await persistLocalAiSettings(); });
    localAiModelSelect.addEventListener('change', async () => { updateLocalAiSettingsFromControls(); await persistLocalAiSettings(); });
    if (enableCleanPromptToggle) enableCleanPromptToggle.addEventListener('change', async () => { updateLocalAiSettingsFromControls(); updateCleanPromptButtons(); await persistLocalAiSettings(); });
    if (autoNameStepsToggle) autoNameStepsToggle.addEventListener('change', async () => { updateLocalAiSettingsFromControls(); await persistLocalAiSettings(); });
    btnRefreshLocalModels.addEventListener('click', () => refreshLocalAiModels(true));
    btnLoadLocalModel.addEventListener('click', () => setLocalModelLoaded(true));
    btnUnloadLocalModel.addEventListener('click', () => setLocalModelLoaded(false));
  }

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
  if (btnConfirmMoveStep) btnConfirmMoveStep.addEventListener('click', confirmMoveStepToAnotherGpt);
  const closeMoveStep = document.getElementById('btnCloseMoveStep');
  if (closeMoveStep) closeMoveStep.addEventListener('click', () => moveStepModal.classList.add('hidden'));
  if (btnBulkModel) btnBulkModel.addEventListener('click', openBulkModelModal);
  if (btnConfirmBulkModel) btnConfirmBulkModel.addEventListener('click', confirmBulkModel);
  const closeBulkModel = document.getElementById('btnCloseBulkModel');
  if (closeBulkModel) closeBulkModel.addEventListener('click', () => bulkModelModal.classList.add('hidden'));
  if (btnBulkAiTags) btnBulkAiTags.addEventListener('click', bulkAutoTagSelection);
  if (btnBulkAiNotes) btnBulkAiNotes.addEventListener('click', bulkGenerateMissingNotes);
  if (btnBulkAiClean) btnBulkAiClean.addEventListener('click', bulkCleanSelectedPrompts);

  // --- Batch tags ---
  document.getElementById('btnBulkTags').addEventListener('click', openBulkTagsModal);
  document.getElementById('btnCloseBulkTags').addEventListener('click', () => document.getElementById('bulkTagsModal').classList.add('hidden'));
  document.getElementById('btnConfirmBulkTags').addEventListener('click', confirmBulkTags);

  // --- Batch export / import partiel ---
  document.getElementById('btnBulkExport').addEventListener('click', exportSelection);
  document.getElementById('btnImportPartial').addEventListener('click', () => document.getElementById('filePartialImport').click());
  document.getElementById('filePartialImport').addEventListener('change', importPartial);

  btnScrapePage.addEventListener('click', scrapePage);
  if (scrapeUrlInput) scrapeUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); scrapePage(); } });
  modelSelect.addEventListener('change', updateLimitInput);
  btnSavePreset.addEventListener('click', saveCustomPreset);
  btnDeletePreset.addEventListener('click', deleteCustomPreset);
  btnSplit.addEventListener('click', processSplit);
  if (btnCleanSplitter) btnCleanSplitter.addEventListener('click', cleanSplitterText);
  inputText.addEventListener('input', updateSplitterCounter);
  customLimitInput.addEventListener('input', updateSplitterCounter);
  modelSelect.addEventListener('change', updateSplitterCounter);
  btnClear.addEventListener('click', () => { inputText.value = ''; resultsArea.innerHTML = ''; updateSplitterCounter(); });

  btnOpenCreate.addEventListener('click', () => openMainModal());
  libraryList.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.gpt-card')) return;
    showContextMenu(e, [
      { label: t('command.newGpt'), run: () => openMainModal() }
    ]);
  });
  searchLibrary.addEventListener('input', (e) => renderLibrary(e.target.value));
  searchLibrary.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchLibrary.value) {
      e.preventDefault();
      e.stopPropagation();
      searchLibrary.value = '';
      renderLibrary('');
    }
  });
  if (gptSearchModeSelect) {
    gptSearchModeSelect.addEventListener('change', async (e) => {
      gptSearchMode = e.target.value;
      await chrome.storage.local.set({ gptSearchMode });
      renderLibrary(searchLibrary.value);
    });
  }
  if (gptSortSelect) {
    gptSortSelect.addEventListener('change', async (e) => {
      gptSortMode = e.target.value;
      await chrome.storage.local.set({ gptSortMode });
      renderLibrary(searchLibrary.value);
    });
  }
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
  document.getElementById('btnOrganizeLibrary').addEventListener('click', organizeUnfiledGpts);
  document.getElementById('gptZoomSlider').addEventListener('input', async (e) => {
    gptZoomLevel = parseInt(e.target.value);
    await chrome.storage.local.set({ gptZoomLevel });
    applyGptViewMode();
  });

  // --- Raccourci nouveau dossier depuis le modal d'édition GPT ---
  document.getElementById('btnQuickNewFolder').addEventListener('click', quickCreateFolder);

  btnCopySystem.addEventListener('click', (e) => copyToClipboard(detailSystemPrompt.textContent, e.target, { type: 'gpt', id: currentViewingGptId }));
  btnEditCurrentGPT.addEventListener('click', () => {
    const gpt = gptLibrary.find(g => g.id === currentViewingGptId);
    if(gpt) openMainModal(gpt);
  });
  btnOpenAddStep.addEventListener('click', () => openStepModal());

  document.getElementById('btnCloseModal').addEventListener('click', () => editModal.classList.add('hidden'));
  btnSaveGPT.addEventListener('click', saveGPT);
  if (btnSuggestTags) btnSuggestTags.addEventListener('click', suggestTagsWithLocalAi);
  if (btnGenerateNote) btnGenerateNote.addEventListener('click', generateNoteWithLocalAi);
  if (btnApplySuggestedTags) btnApplySuggestedTags.addEventListener('click', applyPendingSuggestedTags);
  ensureGptAiHelpers();
  ensureStepCleanHelpers();
  gptPromptInput.addEventListener('blur', autoNameAndSuggestFolder);
  gptPromptInput.addEventListener('input', debounce(updateDuplicateWarning, 350));
  gptNameInput.addEventListener('input', debounce(updateDuplicateWarning, 350));
  document.getElementById('btnCloseStepModal').addEventListener('click', () => stepModal.classList.add('hidden'));
  btnSaveStep.addEventListener('click', saveStep);

  gptPromptInput.addEventListener('blur', () => {
    const currentTags = gptTagsInput.value.split(',').map(x => x.trim()).filter(x => x && x.length > 0);
    autoSuggestTags(gptPromptInput.value, currentTags);
  });
  setupTagAutocomplete(gptTagsInput);

  btnOpenCreateImg.addEventListener('click', () => openImgModal());
  imageGalleryGrid.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.gallery-card')) return;
    showContextMenu(e, [
      { label: t('command.newImage'), run: () => openImgModal() }
    ]);
  });
  document.getElementById('btnCloseImgModal').addEventListener('click', () => imgModal.classList.add('hidden'));
  btnSaveImg.addEventListener('click', saveImg);
  setupTagAutocomplete(imgTagsInput);
  searchImages.addEventListener('input', (e) => renderImageGallery(e.target.value));
  searchImages.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchImages.value) {
      e.preventDefault();
      e.stopPropagation();
      searchImages.value = '';
      renderImageGallery('');
    }
  });
  if (imgSearchModeSelect) {
    imgSearchModeSelect.addEventListener('change', async (e) => {
      imgSearchMode = e.target.value;
      await chrome.storage.local.set({ imgSearchMode });
      renderImageGallery(searchImages.value);
    });
  }
  if (imgSortSelect) {
    imgSortSelect.addEventListener('change', async (e) => {
      imgSortMode = e.target.value;
      await chrome.storage.local.set({ imgSortMode });
      renderImageGallery(searchImages.value);
    });
  }

  // --- Import partiel pour Studio Img ---
  document.getElementById('btnImportPartialImg').addEventListener('click', () => document.getElementById('filePartialImportImg').click());
  document.getElementById('filePartialImportImg').addEventListener('change', importPartial);
  document.getElementById('btnSelectImagesNoPrompt').addEventListener('click', selectImagesWithoutPrompt);

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
  btnCopyImgPrompt.addEventListener('click', (e) => copyToClipboard(imgDetailPrompt.textContent, e.target, { type: 'image', id: currentViewingImgId }));
  btnCopyImgParams.addEventListener('click', (e) => copyToClipboard(imgDetailParams.textContent, e.target, { type: 'image', id: currentViewingImgId }));
  
  btnOpenAddImgStep.addEventListener('click', () => openImgStepModal());
  document.getElementById('btnCloseImgStepModal').addEventListener('click', () => imgStepModal.classList.add('hidden'));
  document.getElementById('btnSaveImgStep').addEventListener('click', saveImgStep);

  btnCloseLightbox.addEventListener('click', () => lightboxModal.classList.add('hidden'));
  lightboxModal.addEventListener('click', (e) => { if(e.target === lightboxModal) lightboxModal.classList.add('hidden'); });
  setupLightboxZoom();
  updateSplitterCounter();

  setupDropZone(dropZoneBefore, 'previewBefore');
  setupDropZone(dropZoneAfter, 'previewAfter');
  setupDropZone(dropZoneStep, 'previewStep');
  setupDropZone(dropZoneStepAfter, 'previewStepAfter');
  setupDropZone(document.getElementById('dropZoneGpt'), 'previewGpt');
  setupDropZone(document.getElementById('dropZoneGptStep'), 'previewGptStep');
  setupModalGlobalDrop(); // drop n'importe où dans le modal image

  if(btnDeleteCurrentGPT) btnDeleteCurrentGPT.addEventListener('click', deleteCurrentGPT);
  if(btnDeleteCurrentImg) btnDeleteCurrentImg.addEventListener('click', deleteCurrentImg);
  setupModalEnterHandlers();

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
  const url = (scrapeUrlInput?.value || '').trim();
  if (!url) return alert(t('alerts.invalidUrl'));

  const originalText = btnScrapePage.textContent;
  btnScrapePage.disabled = true;
  btnScrapePage.textContent = t('splitter.scraping');
  try {
    await waitForTauri();
    const text = await invoke('fetch_page_text', { url });
    if (!text || !text.trim()) return alert(t('alerts.noTextOnPage'));
    inputText.value = text;
    btnScrapePage.textContent = t('alerts.scrapeImported');
    setTimeout(() => { btnScrapePage.textContent = originalText; }, 1500);
  } catch (err) {
    console.error(err);
    alert(t('alerts.scrapeAccessError') + '\n\n' + (err?.message || err || t('alerts.scrapeFailed')));
  } finally {
    btnScrapePage.disabled = false;
    if (btnScrapePage.textContent === t('splitter.scraping')) btnScrapePage.textContent = originalText;
  }
}

async function refreshLocalAiModels(showAlert = true) {
  if (!localAiProviderSelect) return;
  updateLocalAiSettingsFromControls();
  localAiStatus.textContent = t('settings.localAiDetecting');
  btnRefreshLocalModels.disabled = true;
  try {
    await waitForTauri();
    localAiModels = await invoke('local_ai_list_models', {
      provider: localAiSettings.provider,
      baseUrl: getLocalAiBaseUrl(),
      apiToken: localAiSettings.apiToken || null
    });
    renderLocalAiModels();
    updateLocalAiSettingsFromControls();
    await persistLocalAiSettings();
    localAiStatus.textContent = t('settings.localAiFound', { count: localAiModels.length });
  } catch (err) {
    console.error(err);
    localAiModels = [];
    renderLocalAiModels();
    localAiStatus.textContent = t('settings.localAiError') + ' ' + (err?.message || err);
    if (showAlert) alert(localAiStatus.textContent);
  } finally {
    btnRefreshLocalModels.disabled = false;
  }
}

async function setLocalModelLoaded(load) {
  updateLocalAiSettingsFromControls();
  if (!localAiSettings.model) return alert(t('alerts.localAiNoModel'));
  const button = load ? btnLoadLocalModel : btnUnloadLocalModel;
  button.disabled = true;
  localAiStatus.textContent = load ? t('settings.localAiLoading') : t('settings.localAiUnloading');
  try {
    const command = load ? 'local_ai_load_model' : 'local_ai_unload_model';
    const result = await invoke(command, {
      provider: localAiSettings.provider,
      baseUrl: getLocalAiBaseUrl(),
      apiToken: localAiSettings.apiToken || null,
      model: localAiSettings.model,
      instanceId: localAiSettings.instanceId || null
    });
    if (load) localAiSettings.instanceId = result || localAiSettings.model;
    else localAiSettings.instanceId = '';
    await persistLocalAiSettings();
    localAiStatus.textContent = load ? t('settings.localAiLoaded') : t('settings.localAiUnloaded');
    await refreshLocalAiModels(false);
  } catch (err) {
    console.error(err);
    localAiStatus.textContent = t('settings.localAiError') + ' ' + (err?.message || err);
    alert(localAiStatus.textContent);
  } finally {
    button.disabled = false;
  }
}

function parseLocalAiJson(text) {
  try { return JSON.parse(text); } catch (e) { /* extraction ci-dessous */ }
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (e) { /* extraction ci-dessous */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(t('alerts.localAiBadJson'));
  return JSON.parse(match[0]);
}

async function callLocalAiRaw(system, prompt) {
  updateLocalAiSettingsFromControls();
  if (!localAiSettings.model) throw new Error(t('alerts.localAiNoModel'));
  const modelForRequest = (localAiSettings.provider === 'lmstudio' && localAiSettings.instanceId)
    ? localAiSettings.instanceId
    : localAiSettings.model;
  return await invoke('local_ai_generate', {
    provider: localAiSettings.provider,
    baseUrl: getLocalAiBaseUrl(),
    apiToken: localAiSettings.apiToken || null,
    model: modelForRequest,
    system,
    prompt
  });
}

async function callLocalAiJson(system, prompt) {
  const raw = await callLocalAiRaw(system, prompt);
  return parseLocalAiJson(raw);
}

async function suggestTagsWithLocalAi() {
  const prompt = gptPromptInput.value.trim();
  if (!prompt) return alert(t('alerts.missingNamePrompt'));
  btnSuggestTags.disabled = true;
  const original = btnSuggestTags.textContent;
  btnSuggestTags.textContent = t('modal.gpt.generating');
  try {
    pendingSuggestedTags = await generateTagsForGpt({ prompt }, 5);
    if (!pendingSuggestedTags.length) return alert(t('alerts.localAiNoSuggestion'));
    suggestedTagsText.textContent = pendingSuggestedTags.join(', ');
    suggestedTagsBox.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    alert(t('alerts.localAiError') + '\n\n' + (err?.message || err));
  } finally {
    btnSuggestTags.disabled = false;
    btnSuggestTags.textContent = original;
  }
}

function applyPendingSuggestedTags() {
  const current = gptTagsInput.value.split(',').map(x => x.trim()).filter(Boolean);
  const merged = Array.from(new Set([...current, ...pendingSuggestedTags]));
  gptTagsInput.value = merged.join(', ');
  suggestedTagsBox.classList.add('hidden');
}

async function generateNoteWithLocalAi() {
  const prompt = gptPromptInput.value.trim();
  if (!prompt) return alert(t('alerts.missingNamePrompt'));
  btnGenerateNote.disabled = true;
  const original = btnGenerateNote.textContent;
  btnGenerateNote.textContent = t('modal.gpt.generating');
  try {
    const data = await callLocalAiJson(
      t('ai.noteSystem'),
      t('ai.notePrompt', { prompt: prompt.slice(0, 8000) })
    );
    const note = String(data.note || '').trim();
    if (!note) return alert(t('alerts.localAiNoSuggestion'));
    gptNoteInput.value = note;
  } catch (err) {
    console.error(err);
    alert(t('alerts.localAiError') + '\n\n' + (err?.message || err));
  } finally {
    btnGenerateNote.disabled = false;
    btnGenerateNote.textContent = original;
  }
}

async function improvePromptWithLocalAi() {
  const prompt = gptPromptInput.value.trim();
  if (!prompt) return alert(t('alerts.missingNamePrompt'));
  const btn = document.getElementById('btnImprovePrompt');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('modal.gpt.generating');
  try {
    const data = await callLocalAiJson(
      t('ai.improveSystem'),
      t('ai.improvePrompt', { prompt: prompt.slice(0, 9000) })
    );
    const improved = String(data.prompt || data.improved_prompt || '').trim();
    if (!improved) return alert(t('alerts.localAiNoSuggestion'));
    showPromptDiff(prompt, improved, t('modal.gpt.improveTitle'));
  } catch (err) {
    console.error(err);
    alert(t('alerts.localAiError') + '\n\n' + (err?.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function cleanFieldWithLocalAi(textarea, title = t('modal.gpt.cleanTitle'), button = null, afterApply = null) {
  const text = textarea.value.trim();
  if (!text) return alert(t('alerts.missingNamePrompt'));
  const original = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = t('modal.gpt.generating');
  }
  try {
    const cleaned = await callCleanText(text);
    if (!cleaned) return alert(t('alerts.localAiNoSuggestion'));
    showPromptDiff(text, cleaned, title, () => { textarea.value = cleaned; if (afterApply) afterApply(); });
  } catch (err) {
    console.error(err);
    alert(t('alerts.localAiError') + '\n\n' + (err?.message || err));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

async function cleanPromptWithLocalAi() {
  const btn = document.getElementById('btnCleanPrompt');
  await cleanFieldWithLocalAi(gptPromptInput, t('modal.gpt.cleanTitle'), btn);
}

async function cleanNoteWithLocalAi() {
  const btn = document.getElementById('btnCleanNote');
  await cleanFieldWithLocalAi(gptNoteInput, t('modal.gpt.cleanNoteTitle'), btn);
}

async function cleanStepPromptWithLocalAi() {
  const btn = document.getElementById('btnCleanStepPrompt');
  await cleanFieldWithLocalAi(stepContentInput, t('modal.step.cleanTitle'), btn);
}

async function cleanImgStepPromptWithLocalAi() {
  const btn = document.getElementById('btnCleanImgStepPrompt');
  await cleanFieldWithLocalAi(document.getElementById('imgStepContent'), t('modal.imgStep.cleanTitle'), btn);
}

async function cleanSplitterText() {
  await cleanFieldWithLocalAi(inputText, t('splitter.cleanTitle'), btnCleanSplitter, updateSplitterCounter);
}

async function cleanCurrentGptPrompt() {
  const gpt = gptLibrary.find(g => g.id === currentViewingGptId && !g.deleted);
  if (!gpt?.prompt) return;
  const cleaned = await callCleanText(gpt.prompt);
  if (!cleaned) return alert(t('alerts.localAiNoSuggestion'));
  showPromptDiff(gpt.prompt, cleaned, t('modal.gpt.cleanTitle'), async () => {
    gpt.prompt = cleaned;
    gpt.updated = Date.now();
    await chrome.storage.local.set({ gptLibrary });
    showDetailView(gpt);
    renderLibrary(searchLibrary.value);
    showToast(t('toast.saved'));
  });
}

async function callCleanText(text) {
  const source = String(text || '');
  const raw = await callLocalAiRaw(
    t('ai.cleanSystem'),
    t('ai.cleanPrompt', { text: source.slice(0, 9000), prompt: source.slice(0, 9000) })
  );
  return parseCleanTextResponse(raw, source);
}

function parseCleanTextResponse(raw, source = '') {
  const original = String(raw || '').trim();
  if (!original) return '';
  try {
    const data = parseLocalAiJson(original);
    const value = data.text || data.prompt || data.cleaned_text || data.cleaned_prompt;
    if (value) return sanitizeCleanTextCandidate(String(value), source);
  } catch (e) {
    // Le nettoyage reste exploitable même si le modèle n'a pas rendu un JSON strict.
  }
  let text = original
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const looseTextMatch = text.match(/\{\s*"?(?:text|prompt|cleaned_text|cleaned_prompt)"?\s*:\s*"([\s\S]*)/i);
  if (looseTextMatch) {
    text = looseTextMatch[1]
      .replace(/"\s*\}\s*$/s, '')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .trim();
  }
  return sanitizeCleanTextCandidate(text, source);
}

function sanitizeCleanTextCandidate(candidate, source = '') {
  const text = String(candidate || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  const sourceTrimmed = String(source || '').trim();
  const looksLikeInstructionEcho =
    lower.includes('corrige uniquement les fautes d\'orthographe et de grammaire. normalise les espaces multiples') ||
    lower.includes('correct only spelling and grammar mistakes. normalize repeated spaces') ||
    lower.includes('{"text":"texte corrigé"}') ||
    lower.includes('{"text":"corrected text"}') ||
    /^\s*(texte|text)\s*:/i.test(text) ||
    /\n\s*(texte|text)\s*:/i.test(text);
  if (looksLikeInstructionEcho) {
    const markerMatch = text.match(/(?:^|\n)\s*(?:TEXTE|TEXT)\s*:\s*([\s\S]*)$/i);
    if (markerMatch) {
      const afterMarker = markerMatch[1].trim();
      if (afterMarker && afterMarker !== sourceTrimmed && !/(corrige uniquement les fautes d'orthographe et de grammaire\. normalise les espaces multiples|correct only spelling and grammar mistakes\. normalize repeated spaces|\{"text":"texte corrigé"\}|\{"text":"corrected text"\})/i.test(afterMarker)) {
        return normalizeCleanedTextLayout(afterMarker);
      }
    }
    console.warn('Réponse nettoyage ignorée: écho de consigne détecté');
    return '';
  }
  if (/^\s*\{/.test(text) && !/^\s*\{\s*"?(?:text|prompt|cleaned_text|cleaned_prompt)"?\s*:/i.test(text)) {
    console.warn('Réponse nettoyage ignorée: JSON inattendu');
    return '';
  }
  return normalizeCleanedTextLayout(text);
}

function normalizeCleanedTextLayout(value) {
  const rawLines = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, '').replace(/[ \t]{2,}/g, ' '));
  const output = [];
  let paragraph = [];
  let previousListKind = '';
  let previousListEndedWithColon = false;
  let implicitListAfterColon = false;

  const listInfo = (line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^(\d+)([.)/])\s+(.+)$/) || trimmed.match(/^([-*•–—])\s+(.+)$/);
    if (!match) return null;
    if (match.length === 4) return { marker: `${match[1]}${match[2]}`, body: match[3], kind: match[2] === '/' ? 'slash' : 'numbered' };
    return { marker: match[1] === '•' ? '-' : match[1], body: match[2], kind: 'bullet' };
  };
  const isHeading = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/[:：]\s*$/.test(trimmed) && trimmed.length <= 220) return true;
    if (/^[A-ZÀ-Ÿ0-9][A-ZÀ-Ÿ0-9\s'’\-()]{2,60}$/.test(trimmed) && !/[.!?]$/.test(trimmed)) return true;
    return false;
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    if (text) output.push(text);
    paragraph = [];
  };
  const addBlankIfNeeded = () => {
    if (output.length && output[output.length - 1] !== '') output.push('');
  };

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const info = listInfo(line);
    const previous = output[output.length - 1] || '';
    const shouldBeImplicitBullet = implicitListAfterColon && !info && !isHeading(line) && /^[a-zà-ÿ]/.test(line);

    if (info || shouldBeImplicitBullet) {
      flushParagraph();
      const item = info || { marker: '-', body: line, kind: 'implicit' };
      const nested = item.kind === 'slash' && (previousListKind === 'numbered' && previousListEndedWithColon || previousListKind === 'slash');
      const implicitNested = item.kind === 'implicit';
      const prefix = nested || implicitNested ? '\t' : '';
      output.push(`${prefix}${item.marker} ${item.body.trim()}`);
      previousListKind = item.kind;
      previousListEndedWithColon = /[:：]\s*$/.test(item.body);
      implicitListAfterColon = previousListEndedWithColon || implicitNested;
      continue;
    }

    if (isHeading(line)) {
      flushParagraph();
      addBlankIfNeeded();
      output.push(line);
      previousListKind = '';
      previousListEndedWithColon = false;
      implicitListAfterColon = /[:：]\s*$/.test(line);
      continue;
    }

    if (previous && previous !== '' && listInfo(previous) && /^[a-zà-ÿ]/.test(line)) {
      output[output.length - 1] = `${previous} ${line}`;
    } else {
      paragraph.push(line);
      const sentenceCount = (paragraph.join(' ').match(/[.!?](?:\s|$)/g) || []).length;
      if (paragraph.join(' ').length > 420 || sentenceCount >= 3) {
        flushParagraph();
        addBlankIfNeeded();
      }
    }
    previousListKind = '';
    previousListEndedWithColon = false;
    implicitListAfterColon = false;
  }
  flushParagraph();
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function callStepTitle(prompt) {
  const data = await callLocalAiJson(
    t('ai.stepTitleSystem'),
    t('ai.stepTitlePrompt', { prompt: String(prompt || '').slice(0, 5000) })
  );
  return String(data.title || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').slice(0, 80);
}

function updateCleanPromptButtons() {
  const enabled = !!localAiSettings.enableClean;
  ['btnCleanPrompt', 'btnCleanNote', 'btnCleanStepPrompt', 'btnCleanImgStepPrompt', 'btnCleanCurrentGPT', 'btnCleanSplitter'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('hidden', !enabled);
  });
  if (btnBulkAiClean) btnBulkAiClean.classList.toggle('hidden', !enabled || selectionMode !== 'text');
}

function showPromptDiff(before, after, title = t('modal.gpt.improveTitle'), onApply = null) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay prompt-diff-modal';
  overlay.innerHTML = `<div class="modal-content large-modal"><div class="modal-header"><h3>${escapeHtml(title)}</h3><button class="close-btn" data-action="close">&times;</button></div><div class="modal-body diff-grid"><div><label>${t('modal.gpt.before')}</label><textarea readonly>${escapeTextArea(before)}</textarea></div><div><label>${t('modal.gpt.after')}</label><textarea readonly>${escapeTextArea(after)}</textarea></div></div><div class="modal-footer"><button class="secondary" data-action="close">${t('confirm.cancel')}</button><button class="primary" data-action="apply">${t('modal.gpt.applyPrompt')}</button></div></div>`;
  overlay.querySelectorAll('[data-action="close"]').forEach(btn => btn.addEventListener('click', () => overlay.remove()));
  overlay.querySelector('[data-action="apply"]').addEventListener('click', async () => {
    if (onApply) await onApply();
    else gptPromptInput.value = after;
    overlay.remove();
    updateDuplicateWarning();
  });
  document.body.appendChild(overlay);
}

async function autoNameAndSuggestFolder() {
  const prompt = gptPromptInput.value.trim();
  if (!prompt || editIdInput.value) return;
  if (!gptNameInput.value.trim()) {
    try {
      const data = await callLocalAiJson(t('ai.titleSystem'), t('ai.titlePrompt', { prompt: prompt.slice(0, 5000) }));
      const title = String(data.title || '').trim();
      if (title) gptNameInput.value = title.slice(0, 80);
    } catch (e) {
      console.warn('Titre IA non généré', e);
    }
  }
  suggestLikelyFolder(prompt);
}

function suggestLikelyFolder(prompt) {
  if (!prompt || gptFolderSelect.value || !folders.length) return;
  const scored = folders.map(folder => {
    const folderPrompts = gptLibrary.filter(g => !g.deleted && g.folderId === folder.id).map(g => `${g.name} ${g.prompt} ${(g.tags || []).join(' ')}`).join(' ');
    return { folder, score: textSimilarity(prompt, folderPrompts) };
  }).sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0.16) gptFolderSelect.value = scored[0].folder.id;
}

function updateDuplicateWarning() {
  const box = document.getElementById('duplicateWarning');
  if (!box) return;
  const text = `${gptNameInput.value} ${gptPromptInput.value}`.trim();
  const found = findSimilarGpt(text, editIdInput.value);
  if (!found) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `<span>${t('alerts.duplicateWarning', { name: found.gpt.name, percent: Math.round(found.score * 100) })}</span><button type="button" class="secondary tiny-btn">${t('alerts.openSimilar')}</button>`;
  box.querySelector('button').addEventListener('click', () => {
    editModal.classList.add('hidden');
    showDetailView(found.gpt);
  });
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
  if(!await customConfirm(t('alerts.restoreWarn'))) return;

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

async function emptyImageTrash() {
  const deletedImages = imageLibrary.filter(img => img.deleted).length;
  const deletedSteps = imageLibrary.reduce((count, img) => count + (img.steps || []).filter(step => step.deleted).length, 0);
  if (!deletedImages && !deletedSteps) return alert(t('alerts.imageTrashEmpty'));
  if (!await customConfirm(t('alerts.confirmEmptyImageTrash', { images: deletedImages, steps: deletedSteps }))) return;

  imageLibrary = imageLibrary
    .filter(img => !img.deleted)
    .map(img => ({
      ...img,
      steps: (img.steps || []).filter(step => !step.deleted)
    }));

  if (currentViewingImgId && !imageLibrary.some(img => img.id === currentViewingImgId)) {
    currentViewingImgId = null;
    showImgGallery();
  }

  await chrome.storage.local.set({ imageLibrary });
  renderImageGallery(searchImages.value);
  alert(t('alerts.imageTrashEmptied', { images: deletedImages, steps: deletedSteps }));
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 35%)`;
}

function parseTagsInput(value) {
  return String(value || '').split(',').map(x => x.trim()).filter(Boolean);
}

function renderTagsHtml(tags = []) {
  return (tags || []).map(tag => {
    const safeTag = String(tag).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<button type="button" class="tag clickable-tag" data-tag="${safeTag}" style="background:${stringToColor(tag)};">${safeTag}</button>`;
  }).join('');
}

function escapeTextArea(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return escapeTextArea(value).replace(/"/g, '&quot;');
}

function customInput({ title, label, value = '', placeholder = '', confirmLabel = t('modal.step.confirm') }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay input-modal';
    overlay.innerHTML = `<div class="modal-content"><div class="modal-header"><h3>${escapeHtml(title)}</h3><button class="close-btn" data-action="cancel">&times;</button></div><div class="modal-body"><label>${escapeHtml(label)}</label><input type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"></div><div class="modal-footer"><button class="secondary" data-action="cancel">${t('confirm.cancel')}</button><button class="primary" data-action="ok">${escapeHtml(confirmLabel)}</button></div></div>`;
    const input = overlay.querySelector('input');
    const finish = (result) => { overlay.remove(); resolve(result); };
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); });
    overlay.querySelectorAll('[data-action="cancel"]').forEach(btn => btn.addEventListener('click', () => finish(null)));
    overlay.querySelector('[data-action="ok"]').addEventListener('click', () => finish(input.value.trim()));
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') finish(null);
      if (e.key === 'Enter') finish(input.value.trim());
    });
    document.body.appendChild(overlay);
    focusModalInput(overlay, input);
  });
}

function bindClickableTags(root, input, renderFn) {
  root.querySelectorAll('.clickable-tag').forEach(tagEl => {
    tagEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tag = tagEl.dataset.tag || tagEl.textContent.trim();
      if (input === searchLibrary && gptSearchMode === 'title') {
        gptSearchMode = 'advanced';
        if (gptSearchModeSelect) gptSearchModeSelect.value = gptSearchMode;
        await chrome.storage.local.set({ gptSearchMode });
      }
      if (input === searchImages && imgSearchMode === 'title') {
        imgSearchMode = 'advanced';
        if (imgSearchModeSelect) imgSearchModeSelect.value = imgSearchMode;
        await chrome.storage.local.set({ imgSearchMode });
      }
      input.value = tag;
      renderFn(tag);
    });
  });
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function tokenizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function textSimilarity(a, b) {
  const sa = new Set(tokenizeText(a));
  const sb = new Set(tokenizeText(b));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach(w => { if (sb.has(w)) inter++; });
  return inter / Math.max(sa.size, sb.size);
}

function findSimilarGpt(text, excludeId = '') {
  let best = null;
  gptLibrary.filter(g => !g.deleted && g.id !== excludeId).forEach(g => {
    const score = textSimilarity(text, `${g.name || ''} ${g.prompt || ''}`);
    if (score > 0.38 && (!best || score > best.score)) best = { gpt: g, score };
  });
  return best;
}

function parseTimestampFromId(id) {
  const m = String(id || '').match(/_(\d{12,})/);
  return m ? Number(m[1]) : 0;
}

function normalizeItemDates(item) {
  const fallback = item.created || parseTimestampFromId(item.id) || Date.now();
  if (!item.created) item.created = fallback;
  if (!item.updated) item.updated = fallback;
  if (item.usageCount === undefined) item.usageCount = 0;
}

function visibleStepCount(item) {
  return (item.steps || []).filter(s => !s.deleted).length;
}

function sortItems(items, mode, nameKey = 'name') {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (mode === 'name_asc') return (a[nameKey] || '').localeCompare(b[nameKey] || '', currentLang, { sensitivity: 'base' });
    if (mode === 'steps_desc') return visibleStepCount(b) - visibleStepCount(a) || (a[nameKey] || '').localeCompare(b[nameKey] || '', currentLang, { sensitivity: 'base' });
    if (mode === 'usage_desc') return (b.usageCount || 0) - (a.usageCount || 0) || (b.updated || b.created || 0) - (a.updated || a.created || 0);
    if (mode === 'created_desc') return (b.created || 0) - (a.created || 0);
    return (b.updated || b.created || 0) - (a.updated || a.created || 0);
  });
  return sorted;
}

function closeContextMenu() {
  document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
}

function showContextMenu(event, actions) {
  event.preventDefault();
  event.stopPropagation();
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  actions.forEach(action => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = action.danger ? 'danger' : '';
    btn.textContent = action.label;
    btn.addEventListener('click', async () => {
      closeContextMenu();
      await action.run();
    });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const left = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8);
  const top = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function ensureFinderBar() {
  let bar = document.getElementById('inPageFinder');
  if (bar) return bar;
  bar = document.createElement('div');
  bar.id = 'inPageFinder';
  bar.className = 'in-page-finder hidden';
  bar.innerHTML = `<input id="finderInput" type="text"><span id="finderCount"></span><button type="button" data-nav="-1">↑</button><button type="button" data-nav="1">↓</button><button type="button" data-close="1">×</button>`;
  document.body.appendChild(bar);
  const input = bar.querySelector('#finderInput');
  input.addEventListener('input', () => {
    finderState.query = input.value.trim();
    updateFinderMatches();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFinder();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      navigateFinder(e.shiftKey ? -1 : 1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigateFinder(e.key === 'ArrowDown' ? 1 : -1);
    }
  });
  bar.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => navigateFinder(Number(btn.dataset.nav))));
  bar.querySelector('[data-close]').addEventListener('click', closeFinder);
  return bar;
}

function openFinder(type) {
  if (!type) return;
  finderState.open = true;
  finderState.type = type;
  finderState.query = '';
  finderState.index = 0;
  const bar = ensureFinderBar();
  const input = bar.querySelector('#finderInput');
  input.placeholder = t('finder.placeholder');
  input.value = '';
  bar.classList.remove('hidden');
  if (type === 'text') {
    if (searchLibrary.value) {
      searchLibrary.value = '';
      renderLibrary('');
    }
  } else if (type === 'image') {
    if (searchImages.value) {
      searchImages.value = '';
      renderImageGallery('');
    }
  }
  updateFinderMatches();
  input.focus();
}

function closeFinder() {
  finderState.open = false;
  finderState.type = null;
  finderState.query = '';
  finderState.matches = [];
  document.getElementById('inPageFinder')?.classList.add('hidden');
  document.querySelectorAll('.finder-match, .finder-active').forEach(el => el.classList.remove('finder-match', 'finder-active'));
}

function getFinderCards() {
  if (!finderState.open) return [];
  const root = finderState.type === 'image' ? imageGalleryGrid : libraryList;
  const selector = finderState.type === 'image' ? '.gallery-card' : '.gpt-card';
  return Array.from(root.querySelectorAll(selector));
}

function applyFinderHighlight() {
  if (!finderState.open) return;
  updateFinderMatches(false);
}

function updateFinderMatches(scroll = true) {
  const cards = getFinderCards();
  cards.forEach(card => card.classList.remove('finder-match', 'finder-active'));
  const query = finderState.query.toLowerCase();
  finderState.matches = query ? cards.filter(card => card.textContent.toLowerCase().includes(query)) : [];
  if (finderState.index >= finderState.matches.length) finderState.index = 0;
  if (finderState.index < 0) finderState.index = Math.max(0, finderState.matches.length - 1);
  finderState.matches.forEach((card, idx) => {
    card.classList.add('finder-match');
    card.classList.toggle('finder-active', idx === finderState.index);
  });
  const count = document.getElementById('finderCount');
  if (count) {
    count.textContent = !query
      ? ''
      : (finderState.matches.length ? t('finder.count', { current: finderState.index + 1, total: finderState.matches.length }) : t('finder.noResults'));
  }
  if (scroll && finderState.matches[finderState.index]) finderState.matches[finderState.index].scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function navigateFinder(delta) {
  if (!finderState.matches.length) return;
  finderState.index = (finderState.index + delta + finderState.matches.length) % finderState.matches.length;
  updateFinderMatches();
}

function openCommandPalette() {
  let overlay = document.getElementById('commandPalette');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'commandPalette';
    overlay.className = 'modal-overlay command-palette hidden';
    overlay.innerHTML = `<div class="modal-content"><input id="commandPaletteInput" type="text" placeholder="${t('command.placeholder')}"><div id="commandPaletteList" class="command-list"></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.getElementById('commandPaletteInput').addEventListener('input', renderCommandPalette);
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') overlay.classList.add('hidden');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveCommandPaletteActive(e.key === 'ArrowDown' ? 1 : -1);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        overlay.querySelector('.command-item.active')?.click();
      }
    });
  }
  overlay.classList.remove('hidden');
  const input = document.getElementById('commandPaletteInput');
  input.value = '';
  renderCommandPalette();
  input.focus();
}

function moveCommandPaletteActive(delta) {
  const items = Array.from(document.querySelectorAll('#commandPaletteList .command-item'));
  if (!items.length) return;
  const current = items.findIndex(item => item.classList.contains('active'));
  const next = current === -1 ? 0 : (current + delta + items.length) % items.length;
  items.forEach((item, idx) => item.classList.toggle('active', idx === next));
  items[next].scrollIntoView({ block: 'nearest' });
}

function commandActions() {
  const actions = [
    { label: t('command.newGpt'), run: () => openMainModal() },
    { label: t('command.newImage'), run: () => openImgModal() },
    { label: t('command.settings'), run: () => btnOpenSettings.click() },
    { label: t('command.export'), run: () => exportBackup() },
    { label: t('command.organize'), run: () => organizeUnfiledGpts() },
    { label: t('tabs.splitter'), run: () => document.querySelector('[data-target="view-splitter"]').click() },
    { label: t('tabs.library'), run: () => document.querySelector('[data-target="view-library"]').click() },
    { label: t('tabs.images'), run: () => document.querySelector('[data-target="view-images"]').click() }
  ];
  Object.entries(allPresets)
    .filter(([id]) => !DEFAULT_PRESETS[id])
    .forEach(([id, preset]) => actions.push({
      label: t('command.applyPreset', { name: preset.label }),
      run: () => {
        document.querySelector('[data-target="view-splitter"]').click();
        modelSelect.value = id;
        updateLimitInput();
        updateSplitterCounter();
      }
    }));
  gptLibrary.filter(g => !g.deleted).forEach(g => actions.push({ label: `${t('command.openGpt')} ${g.name}`, run: () => { document.querySelector('[data-target="view-library"]').click(); showDetailView(g); } }));
  imageLibrary.filter(i => !i.deleted).forEach(img => actions.push({ label: `${t('command.openImage')} ${img.title}`, run: () => { document.querySelector('[data-target="view-images"]').click(); showImgDetail(img); } }));
  return actions;
}

function renderCommandPalette() {
  const input = document.getElementById('commandPaletteInput');
  const list = document.getElementById('commandPaletteList');
  if (!input || !list) return;
  const term = input.value.toLowerCase().trim();
  const matches = commandActions().filter(a => !term || a.label.toLowerCase().includes(term)).slice(0, 12);
  list.innerHTML = '';
  matches.forEach(action => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'command-item';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      document.getElementById('commandPalette').classList.add('hidden');
      action.run();
    });
    list.appendChild(btn);
  });
  list.querySelector('.command-item')?.classList.add('active');
}

async function organizeUnfiledGpts() {
  const unfiled = gptLibrary.filter(g => !g.deleted && !g.folderId);
  if (!unfiled.length) return alert(t('alerts.noUnfiledGpts'));
  const buckets = new Map();
  unfiled.forEach(g => {
    const key = (g.tags && g.tags[0]) || tokenizeText(`${g.name} ${g.prompt}`)[0] || t('filters.unclassified');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  });
  for (const [name, items] of buckets) {
    let folder = folders.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (!folder) {
      folder = { id: `f_${Date.now()}_${folders.length}`, name };
      folders.push(folder);
    }
    items.forEach(g => { g.folderId = folder.id; g.updated = Date.now(); });
  }
  await chrome.storage.local.set({ folders, gptLibrary });
  renderFoldersBar();
  renderLibrary(searchLibrary.value);
  alert(t('alerts.organizeDone', { count: unfiled.length }));
}

function customConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay confirm-modal';
    overlay.innerHTML = `<div class="modal-content"><div class="modal-header"><h3>${t('confirm.title')}</h3></div><div class="modal-body"><p>${message}</p></div><div class="confirm-actions"><button class="secondary small-btn" data-action="cancel">${t('confirm.cancel')}</button><button class="danger small-btn" data-action="ok">${t('confirm.delete')}</button></div></div>`;
    const finish = (value) => { overlay.remove(); resolve(value); };
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(false); });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(false));
    overlay.querySelector('[data-action="ok"]').addEventListener('click', () => finish(true));
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    });
    document.body.appendChild(overlay);
    overlay.querySelector('[data-action="cancel"]').focus();
  });
}

function focusModalInput(modal, preferred) {
  if (!modal) return;
  requestAnimationFrame(() => {
    const target = preferred || modal.querySelector('input:not([type="hidden"]), textarea, select, button');
    if (target && !target.disabled) {
      target.focus();
      if (typeof target.select === 'function' && target.matches('input[type="text"], textarea')) target.select();
    }
  });
}

function bindModalEnter(modal, button) {
  if (!modal || !button) return;
  modal.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      button.click();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.target.closest('.drop-zone')) return;
    if (e.target.matches('textarea')) return;
    if (!e.target.matches('input:not([type]), input[type="text"], input[type="url"], input[type="number"], input[type="password"], select')) return;
    e.preventDefault();
    button.click();
  });
}

function setupModalEnterHandlers() {
  bindModalEnter(folderModal, btnSaveFolder);
  bindModalEnter(imgCategoryModal, btnSaveImgCategory);
  bindModalEnter(editModal, btnSaveGPT);
  bindModalEnter(stepModal, btnSaveStep);
  bindModalEnter(imgModal, btnSaveImg);
  bindModalEnter(imgStepModal, document.getElementById('btnSaveImgStep'));
  bindModalEnter(modelsManageModal, btnAddModel);
  bindModalEnter(document.getElementById('bulkTagsModal'), document.getElementById('btnConfirmBulkTags'));
  bindModalEnter(bulkMoveModal, btnConfirmBulkMove);
  bindModalEnter(moveStepModal, btnConfirmMoveStep);
  bindModalEnter(bulkModelModal, btnConfirmBulkModel);
}

document.addEventListener('click', closeContextMenu);
document.addEventListener('scroll', closeContextMenu, true);

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
    if (btnBulkMove) btnBulkMove.textContent = selectionMode === 'image' ? t('bulk.category') : t('bulk.move');
    if (btnBulkModel) btnBulkModel.classList.toggle('hidden', selectionMode !== 'image');
    if (btnBulkAiNotes) btnBulkAiNotes.classList.toggle('hidden', selectionMode !== 'text');
    if (btnBulkAiClean) btnBulkAiClean.classList.toggle('hidden', selectionMode !== 'text' || !localAiSettings.enableClean);
  } else {
    bulkActionBar.classList.add('hidden');
    selectionMode = null;
  }
}

// I18N : alias appelé après un changement de langue pour rafraîchir le compteur
function updateBulkBar() {
  if (selectedIds.size > 0) {
    bulkCount.textContent = `${selectedIds.size} ${t('bulk.count')}`;
    if (btnBulkMove) btnBulkMove.textContent = selectionMode === 'image' ? t('bulk.category') : t('bulk.move');
    if (btnBulkAiClean) btnBulkAiClean.classList.toggle('hidden', selectionMode !== 'text' || !localAiSettings.enableClean);
  }
}

function forceSingleSelection(id, type) {
  selectedIds.clear();
  selectedIds.add(id);
  lastSelectedId = id;
  selectionMode = type;
  updateSelectionUI();
}

function clearSelection() {
  selectedIds.clear();
  lastSelectedId = null;
  updateSelectionUI();
}

function getVisibleGptCards() {
  if (!libraryListView || libraryListView.classList.contains('hidden')) return [];
  return Array.from(libraryList.querySelectorAll('.gpt-card'));
}

function setKeyboardFocusedGpt(id) {
  keyboardFocusedGptId = id;
  document.querySelectorAll('.gpt-card.keyboard-focused').forEach(card => card.classList.remove('keyboard-focused'));
  document.querySelector(`.gpt-card[data-id="${CSS.escape(id)}"]`)?.classList.add('keyboard-focused');
}

function moveKeyboardGptFocus(delta) {
  const cards = getVisibleGptCards();
  if (!cards.length || currentFolderId === 'trash') return;
  const ids = cards.map(card => card.dataset.id);
  let idx = keyboardFocusedGptId ? ids.indexOf(keyboardFocusedGptId) : -1;
  idx = idx === -1 ? (delta > 0 ? 0 : ids.length - 1) : (idx + delta + ids.length) % ids.length;
  setKeyboardFocusedGpt(ids[idx]);
  cards[idx].scrollIntoView({ block: 'nearest' });
}

function getFocusedOrSingleSelectedTextId() {
  if (selectionMode === 'text' && selectedIds.size === 1) return Array.from(selectedIds)[0];
  return keyboardFocusedGptId;
}

async function deleteSelectedItems() {
  if (!await customConfirm(t('alerts.confirmBulkDelete', { count: selectedIds.size }))) return;

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
  const label = bulkMoveModal.querySelector('.modal-body label');
  if (label) label.textContent = selectionMode === 'image' ? t('modal.move.categoryLabel') : t('modal.move.label');
  bulkMoveSelect.innerHTML = `<option value="">${t('filters.unclassified')}</option>`;
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
  focusModalInput(bulkMoveModal, bulkMoveSelect);
}

function openBulkModelModal() {
  if (selectionMode !== 'image') return;
  bulkModelSelect.innerHTML = '';
  imgModels.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model;
    opt.textContent = model;
    bulkModelSelect.appendChild(opt);
  });
  bulkModelModal.classList.remove('hidden');
}

async function confirmBulkModel() {
  const model = bulkModelSelect.value;
  if (!model) return;
  imageLibrary.forEach(img => {
    if (!selectedIds.has(img.id)) return;
    img.model = model;
    img.updated = Date.now();
  });
  await chrome.storage.local.set({ imageLibrary });
  bulkModelModal.classList.add('hidden');
  renderImageGallery(searchImages.value);
  clearSelection();
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
function updateLimitInput(){const v=modelSelect.value;if(allPresets[v]){customLimitInput.value=allPresets[v].limit;btnDeletePreset.style.display=DEFAULT_PRESETS[v]?'none':'flex';} updateSplitterCounter();}
async function saveCustomPreset(){const n=newPresetName.value.trim(),l=parseInt(customLimitInput.value);if(!n||!l)return;const id=`c_${Date.now()}`,r=await chrome.storage.local.get(['customPresets']),c=r.customPresets||{};c[id]={label:n,limit:l};await chrome.storage.local.set({customPresets:c});newPresetName.value='';loadPresets();}
async function deleteCustomPreset(){if(DEFAULT_PRESETS[modelSelect.value])return;if(!await customConfirm(t('alerts.confirmDeletePreset')))return;const r=await chrome.storage.local.get(['customPresets']),c=r.customPresets||{};delete c[modelSelect.value];await chrome.storage.local.set({customPresets:c});loadPresets();}
function processSplit(){const t=inputText.value.trim(),m=parseInt(customLimitInput.value);if(!t)return;resultsArea.innerHTML='';const c=smartSplit(t,m);c.forEach((ch,i)=>createChunkCard(ch,i+1,c.length));}
function updateSplitterCounter(){
  if (!splitterCounter || !splitterCounterBar) return;
  const count = inputText.value.length;
  const limit = Math.max(0, parseInt(customLimitInput.value) || 0);
  const safeLimit = Math.max(1, limit);
  const parts = count && limit ? Math.ceil(count / safeLimit) : 0;
  const pct = limit ? Math.min(100, (count / safeLimit) * 100) : 0;
  splitterCounter.firstChild.textContent = t('splitter.counter', { count, limit, parts });
  splitterCounterBar.style.width = `${pct}%`;
  splitterCounter.classList.toggle('over-limit', count > limit);
}
function smartSplit(t,m){const c=[];let cur=t;while(cur.length>0){if(cur.length<=m){c.push(cur);break;}let sl=cur.substr(0,m),cut=-1,zn=Math.floor(m*0.8),ln=sl.lastIndexOf('\n');if(ln>zn)cut=ln;else{const lp=Math.max(sl.lastIndexOf('. '),sl.lastIndexOf('! '),sl.lastIndexOf('? '));if(lp>zn)cut=lp+1;}if(cut===-1)cut=sl.lastIndexOf(' ');if(cut===-1)cut=m;c.push(cur.substring(0,cut).trim());cur=cur.substring(cut).trim();}return c;}
function createChunkCard(text, part, totalParts) {
  const w = document.createElement('div');
  w.className = 'chunk-card';
  const start = t('splitter.chunkStart', { part, total: totalParts });
  const end = t('splitter.chunkEnd', { part, total: totalParts });
  let formatted = totalParts > 1 && part === 1
    ? `${t('splitter.chunkIntro')}\n\n${start}\n${text}\n${end}`
    : (totalParts > 1 ? `${start}\n${text}\n${end}` : text);
  if (totalParts > 1 && part === totalParts) formatted += `\n\n${t('splitter.chunkAllSent')}`;
  w.innerHTML = `<div class="chunk-header"><span>${t('splitter.chunkLabel', { part, total: totalParts })}</span><span>${text.length}c</span></div><div class="prompt-preview">${escapeHtml(text)}</div><button class="copy-prompt-btn">${t('library.copy')}</button>`;
  w.querySelector('button').onclick = (e) => copyToClipboard(formatted, e.target);
  resultsArea.appendChild(w);
}

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
      normalizeItemDates(g);
      g.steps.forEach(s => { if(s.deleted === undefined) s.deleted = false; });
  });
  renderFoldersBar(); 
  renderLibrary();
}

async function saveNewFolder() { const n = folderNameInput.value.trim(); if(!n) return; folders.push({id:`f_${Date.now()}`, name:n}); await chrome.storage.local.set({folders}); folderModal.classList.add('hidden'); renderFoldersBar(); showToast(t('toast.saved')); }
async function renameFolder(id) { const f=folders.find(x=>x.id===id); if(!f)return; const n=await customInput({ title: t('context.rename'), label: t('prompts.renameFolder'), value: f.name }); if(n===null||!n.trim())return; f.name=n.trim(); await chrome.storage.local.set({folders}); renderFoldersBar(); renderLibrary(searchLibrary.value); }
async function duplicateFolder(id) {
  const f=folders.find(x=>x.id===id); if(!f)return;
  const now=Date.now(), newId=`f_${now}`;
  folders.push({id:newId, name:t('labels.copyName', { name: f.name })});
  const copies=gptLibrary.filter(g=>!g.deleted&&g.folderId===id).map((g,idx)=>cloneGpt(g,newId,now+idx+1));
  gptLibrary.unshift(...copies);
  await chrome.storage.local.set({folders,gptLibrary});
  currentFolderId=newId;
  renderFoldersBar(); renderLibrary(searchLibrary.value);
}
async function deleteFolder(id) { if(!await customConfirm(t('alerts.confirmDeleteFolder'))) return; folders = folders.filter(f=>f.id!==id); gptLibrary.forEach(g => { if(g.folderId === id) { g.folderId = ""; g.updated = Date.now(); } }); await chrome.storage.local.set({folders, gptLibrary}); if(currentFolderId===id)currentFolderId='all'; renderFoldersBar(); renderLibrary(searchLibrary.value); }

function renderFoldersBar() {
  const counts = getFolderCounts();
  foldersList.innerHTML = '';
  createChip(foldersList, chipLabel(t('filters.all'), counts.all), 'all', currentFolderId, (id)=>{currentFolderId=id; renderLibrary(searchLibrary.value);});
  createChip(foldersList, chipLabel(t('filters.unclassified'), counts.none), 'none', currentFolderId, (id)=>{currentFolderId=id; renderLibrary(searchLibrary.value);});
  if (counts.trash > 0) {
    createChip(foldersList, chipLabel(t('filters.trash'), counts.trash), 'trash', currentFolderId, (id)=>{currentFolderId=id; renderLibrary(searchLibrary.value);});
  }
  folders.forEach(f => {
    const chip = document.createElement('button'); chip.className = `folder-chip ${currentFolderId===f.id?'active':''}`; chip.textContent=chipLabel(f.name, counts.byId.get(f.id) || 0);
    chip.title = t('context.rename');
    chip.onclick=()=>{currentFolderId=f.id; renderFoldersBar(); renderLibrary(searchLibrary.value);}
    chip.ondblclick=(e)=>{e.preventDefault(); e.stopPropagation(); renameFolder(f.id);}
    chip.oncontextmenu=(e)=>showContextMenu(e, [
      { label: t('context.rename'), run: () => renameFolder(f.id) },
      { label: t('context.duplicate'), run: () => duplicateFolder(f.id) },
      { label: t('context.delete'), danger: true, run: () => deleteFolder(f.id) }
    ]);
    foldersList.appendChild(chip);
  });
}

function createChip(parent, lbl, id, curId, cb) { const b=document.createElement('button'); b.className=`folder-chip ${curId===id?'active':''}`; b.textContent=lbl; b.onclick=()=>{cb(id); renderFoldersBar();}; parent.appendChild(b); }

function chipLabel(label, count) {
  return `${label} (${count})`;
}

function getFolderCounts() {
  const visible = gptLibrary.filter(g => !g.deleted);
  return {
    all: visible.length,
    none: visible.filter(g => !g.folderId).length,
    trash: gptLibrary.filter(g => g.deleted).length,
    byId: new Map(folders.map(f => [f.id, visible.filter(g => g.folderId === f.id).length]))
  };
}

function cloneGpt(gpt, folderId = gpt.folderId || "", timestamp = Date.now()) {
  const copy = structuredClone(gpt);
  copy.id = `g_${timestamp}`;
  copy.name = t('labels.copyName', { name: gpt.name });
  copy.folderId = folderId;
  copy.created = timestamp;
  copy.updated = timestamp;
  copy.usageCount = 0;
  copy.deleted = false;
  copy.steps = (copy.steps || []).map((s, idx) => ({ ...s, id: `s_${timestamp}_${idx}`, deleted: false }));
  return copy;
}

async function duplicateGPT(id) {
  const gpt = gptLibrary.find(g => g.id === id);
  if (!gpt) return;
  gptLibrary.unshift(cloneGpt(gpt));
  await chrome.storage.local.set({ gptLibrary });
  renderLibrary(searchLibrary.value);
}

function getGptEmptyState(term, inTrash = false) {
  let title = t('empty.libraryTitle');
  let hint = t('empty.libraryHint');
  if (inTrash) {
    title = t('empty.trashTitle');
    hint = t('empty.trashHint');
  } else if (term) {
    title = t('empty.searchTitle', { term: filterDisplayTerm(term) });
    hint = t('empty.searchHint');
  } else if (currentFolderId === 'none' || currentFolderId !== 'all') {
    title = t('empty.folderTitle');
    hint = t('empty.folderHint');
  }
  return `<div class="empty-state rich-empty"><div class="empty-icon">${inTrash ? '🗑️' : '∅'}</div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(hint)}</span></div>`;
}

function filterDisplayTerm(term) {
  return String(term || '').slice(0, 80);
}

async function restoreGPT(id) {
  const gpt = gptLibrary.find(g => g.id === id);
  if (!gpt) return;
  gpt.deleted = false;
  gpt.updated = Date.now();
  await chrome.storage.local.set({ gptLibrary });
  renderFoldersBar();
  renderLibrary(searchLibrary.value);
  showToast(t('toast.saved'));
}

async function permanentlyDeleteGPT(id) {
  if (!await customConfirm(t('alerts.confirmDeleteGptForever'))) return;
  gptLibrary = gptLibrary.filter(g => g.id !== id);
  await chrome.storage.local.set({ gptLibrary });
  renderFoldersBar();
  renderLibrary(searchLibrary.value);
}

async function cleanGptPromptDirect(id) {
  const gpt = gptLibrary.find(g => g.id === id && !g.deleted);
  if (!gpt?.prompt) return;
  setProcessingItem('text', id, true);
  try {
    const cleaned = await callCleanText(gpt.prompt);
    if (!cleaned) return alert(t('alerts.localAiNoSuggestion'));
    gpt.prompt = cleaned;
    gpt.updated = Date.now();
    await chrome.storage.local.set({ gptLibrary });
    renderLibrary(searchLibrary.value);
    if (currentViewingGptId === id) showDetailView(gpt);
    showToast(t('toast.cleaned'));
  } catch (err) {
    console.error(err);
    alert(t('alerts.localAiError') + '\n\n' + (err?.message || err));
  } finally {
    setProcessingItem('text', id, false);
  }
}

async function cleanGptThread(gpt, { render = true } = {}) {
  if (!gpt) return 0;
  let cleanedCount = 0;
  if (gpt.prompt) {
    try {
      const cleaned = await callCleanText(gpt.prompt);
      if (cleaned && cleaned !== gpt.prompt) {
        gpt.prompt = cleaned;
        cleanedCount++;
      }
    } catch (err) {
      console.warn('Nettoyage prompt principal ignoré', err);
    }
  }
  const steps = (gpt.steps || []).filter(step => !step.deleted && step.content);
  for (const step of steps) {
    setProcessingStep('gpt', step.id, true);
    try {
      const cleaned = await callCleanText(step.content);
      if (cleaned && cleaned !== step.content) {
        step.content = cleaned;
        cleanedCount++;
      }
    } catch (err) {
      console.warn('Nettoyage étape ignoré', err);
    } finally {
      setProcessingStep('gpt', step.id, false);
    }
  }
  if (cleanedCount) {
    gpt.updated = Date.now();
    await chrome.storage.local.set({ gptLibrary });
    if (render) {
      if (currentViewingGptId === gpt.id) showDetailView(gpt);
      else renderLibrary(searchLibrary.value);
    }
  }
  return cleanedCount;
}

async function cleanGptThreadDirect(id) {
  const gpt = gptLibrary.find(g => g.id === id && !g.deleted);
  if (!gpt) return;
  setProcessingItem('text', id, true);
  try {
    const cleaned = await cleanGptThread(gpt);
    showToast(t('toast.threadCleaned', { count: cleaned }));
  } catch (err) {
    console.error(err);
    alert(t('alerts.localAiError') + '\n\n' + (err?.message || err));
  } finally {
    setProcessingItem('text', id, false);
  }
}

async function emptyGptTrash() {
  const deletedGpts = gptLibrary.filter(g => g.deleted).length;
  const deletedSteps = gptLibrary.reduce((count, g) => count + (g.steps || []).filter(step => step.deleted).length, 0);
  if (!deletedGpts && !deletedSteps) return alert(t('alerts.gptTrashEmpty'));
  if (!await customConfirm(t('alerts.confirmEmptyGptTrash', { gpts: deletedGpts, steps: deletedSteps }))) return;
  gptLibrary = gptLibrary
    .filter(g => !g.deleted)
    .map(g => ({ ...g, steps: (g.steps || []).filter(step => !step.deleted) }));
  await chrome.storage.local.set({ gptLibrary });
  if (currentFolderId === 'trash') currentFolderId = 'all';
  renderFoldersBar();
  renderLibrary(searchLibrary.value);
  alert(t('alerts.gptTrashEmptied', { gpts: deletedGpts, steps: deletedSteps }));
}

function renderLibrary(filter='') {
  libraryList.innerHTML = ''; 
  const term = filter.toLowerCase().trim();
  const inTrash = currentFolderId === 'trash';
  let sub = gptLibrary.filter(g => inTrash ? g.deleted : !g.deleted);

  if(!inTrash && currentFolderId==='none') sub=sub.filter(g=>!g.folderId);
  else if(!inTrash && currentFolderId!=='all') sub=sub.filter(g=>g.folderId===currentFolderId);
  
  // Recherche : titre seul ou recherche avancée selon l'option utilisateur.
  const filtered = !term ? sub : sub.filter(g => {
    if ((g.name || '').toLowerCase().includes(term)) return true;
    if (gptSearchMode === 'title') return false;
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
  if(filtered.length===0){ libraryList.innerHTML=getGptEmptyState(term, inTrash); return; }
  const sorted = sortItems(filtered, gptSortMode, 'name');

  const isGrid = (gptViewMode === 'grid');

  sorted.forEach(gpt => {
    const card = document.createElement('div'); card.className = 'gpt-card'; card.dataset.id = gpt.id;
    if(selectedIds.has(gpt.id)) card.classList.add('selected-card');
    if(keyboardFocusedGptId === gpt.id) card.classList.add('keyboard-focused');
    if(processingItems.has(`text:${gpt.id}`)) card.classList.add('processing');

    const tagsHtml = renderTagsHtml(gpt.tags || []);
    const usageHtml = (gpt.usageCount || 0) > 0 ? `<span class="usage-badge" title="${t('usage.countTitle')}">↗ ${gpt.usageCount}</span>` : '';
    const stepsCount = visibleStepCount(gpt);
    const stepsBadge = stepsCount > 0 ? `<span class="gallery-badge-count gpt-step-count">+${stepsCount}</span>` : '';
    let noteHtml = (gpt.note && gpt.note.trim()) ? `<div class="card-note-preview">${gpt.note}</div>` : '';

    if (inTrash) {
      const promptPreview = (gpt.prompt || '').slice(0, 220);
      card.innerHTML = `${stepsBadge}<span class="card-title">${escapeHtml(gpt.name)}</span>${noteHtml}<div class="gpt-prompt-preview">${escapeHtml(promptPreview)}</div><div class="tags-container">${tagsHtml}</div><div class="trash-card-actions"><button class="secondary small-btn restore-gpt">${t('context.restore')}</button><button class="danger small-btn delete-forever-gpt">${t('context.deleteForever')}</button></div>`;
      card.querySelector('.restore-gpt').addEventListener('click', (e) => { e.stopPropagation(); restoreGPT(gpt.id); });
      card.querySelector('.delete-forever-gpt').addEventListener('click', (e) => { e.stopPropagation(); permanentlyDeleteGPT(gpt.id); });
      card.addEventListener('contextmenu', (e) => showContextMenu(e, [
        { label: t('context.restore'), run: () => restoreGPT(gpt.id) },
        { label: t('context.deleteForever'), danger: true, run: () => permanentlyDeleteGPT(gpt.id) }
      ]));
      libraryList.appendChild(card);
      return;
    }

    if (isGrid) {
      // Vue grille avec aperçu prompt + image de couverture si présente
      const promptPreview = (gpt.prompt || '').slice(0, 220);
      const coverHtml = gpt.coverImg ? `<img src="${gpt.coverImg}" class="gpt-cover-img">` : '';
      card.innerHTML = `<button class="card-duplicate-btn icon-btn small-icon" title="${t('context.duplicate')}">⧉</button><button class="card-delete-btn danger icon-btn small-icon">&times;</button>${usageHtml}${stepsBadge}${coverHtml}<span class="card-title">${escapeHtml(gpt.name)}</span>${noteHtml}<div class="gpt-prompt-preview">${escapeHtml(promptPreview)}</div><div class="tags-container">${tagsHtml}</div>`;
    } else {
      // Vue liste compacte
      const coverHtml = gpt.coverImg ? `<img src="${gpt.coverImg}" class="gpt-cover-img" style="max-height:80px;">` : '';
      card.innerHTML = `<button class="card-duplicate-btn icon-btn small-icon" title="${t('context.duplicate')}">⧉</button><button class="card-delete-btn danger icon-btn small-icon">&times;</button>${usageHtml}${stepsBadge}${coverHtml}<span class="card-title">${escapeHtml(gpt.name)}</span>${noteHtml}<div class="tags-container">${tagsHtml}</div>`;
    }
    bindClickableTags(card, searchLibrary, renderLibrary);
    
    card.querySelector('.card-duplicate-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        duplicateGPT(gpt.id);
    });

    card.querySelector('.card-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteGPT(gpt.id);
    });

    card.addEventListener('contextmenu', (e) => showContextMenu(e, [
      { label: t('context.rename'), run: () => openMainModal(gpt) },
      { label: t('context.duplicate'), run: () => duplicateGPT(gpt.id) },
      { label: t('context.copyPrompt'), run: () => copyToClipboard(gpt.prompt || '', null, { type: 'gpt', id: gpt.id }) },
      { label: t('context.cleanPrompt'), run: () => cleanGptPromptDirect(gpt.id) },
      { label: t('context.cleanThread'), run: () => cleanGptThreadDirect(gpt.id) },
      { label: t('context.nameEmptySteps'), run: () => autoNameGptSteps(gpt, { onlyGeneric: true, toast: true }) },
      { label: t('context.moveToFolder'), run: () => { forceSingleSelection(gpt.id, 'text'); openBulkMoveModal(); } },
      { label: t('context.addTag'), run: () => openMainModal(gpt, { focus: 'tags' }) },
      { label: t('context.delete'), danger: true, run: () => deleteGPT(gpt.id) }
    ]));

    card.addEventListener('click', (e) => {
      setKeyboardFocusedGpt(gpt.id);
      if(!toggleSelection(e, gpt.id, 'text')) showDetailView(gpt);
    });
    libraryList.appendChild(card);
  });
  applyFinderHighlight();
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
  let cleanDetailBtn = document.getElementById('btnCleanCurrentGPT');
  if (!cleanDetailBtn) {
    cleanDetailBtn = document.createElement('button');
    cleanDetailBtn.id = 'btnCleanCurrentGPT';
    cleanDetailBtn.className = 'icon-btn';
    cleanDetailBtn.type = 'button';
    cleanDetailBtn.textContent = '✦';
    cleanDetailBtn.title = t('modal.gpt.clean');
    cleanDetailBtn.addEventListener('click', cleanCurrentGptPrompt);
    btnEditCurrentGPT.parentElement.insertBefore(cleanDetailBtn, btnEditCurrentGPT);
  }
  cleanDetailBtn.title = t('modal.gpt.clean');
  updateCleanPromptButtons();
  detailTitle.textContent=gpt.name;
  detailTitle.ondblclick = () => openMainModal(gpt);
  detailTags.innerHTML=renderTagsHtml(gpt.tags || []);
  bindClickableTags(detailTags, searchLibrary, (tag) => { showListView(); renderLibrary(tag); });
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
  detailSystemPrompt.ondblclick = () => openMainModal(gpt);
  stepsList.innerHTML='';

  const visibleSteps = (gpt.steps||[]).filter(s => !s.deleted);
  visibleSteps.forEach((s,i)=>{
    const originalIndex = gpt.steps.findIndex(os => os.id === s.id);
    const w=document.createElement('div');
    w.className='step-item-wrapper';
    w.setAttribute('draggable','true');
    w.dataset.index=originalIndex;
    w.dataset.stepId=s.id;
    if (processingItems.has(`gpt-step:${s.id}`)) w.classList.add('processing');
    const nh=(s.note)?`<div class="personal-note" style="margin:5px 0"><span class="note-label">Note:</span>${s.note}</div>`:'';
    const imgH = s.img ? `<img src="${s.img}" class="gpt-step-img" data-step-img="${s.id}">` : '';
    w.innerHTML=`<div class="timeline-connector"></div><div class="step-card"><div class="step-header"><div><span class="step-drag-handle">☰</span> <span class="step-badge step">${escapeHtml(stepDisplayLabel(s, i))}</span></div><div><button class="step-actions-btn edit">✎</button><button class="step-actions-btn del">&times;</button></div></div>${nh}${imgH}<div class="prompt-preview">${escapeHtml(s.content)}</div><button class="copy-prompt-btn">${t('library.copy')}</button></div>`;
    w.querySelector('.copy-prompt-btn').onclick=(e)=>copyToClipboard(s.content,e.target, { type: 'gpt', id: currentViewingGptId });
    w.querySelector('.edit').onclick=()=>openStepModal(s);
    w.querySelector('.del').onclick=()=>deleteStep(s.id);
    w.querySelector('.step-card').addEventListener('contextmenu', (e) => showContextMenu(e, [
      { label: t('context.rename'), run: () => renameGptStep(s.id) },
      { label: t('context.aiNameStep'), run: () => nameGptStepWithAi(s.id) },
      { label: t('context.copyStep'), run: () => copyToClipboard(s.content, w.querySelector('.copy-prompt-btn'), { type: 'gpt', id: currentViewingGptId }) },
      { label: t('context.duplicate'), run: () => duplicateStep(s.id) },
      { label: t('context.moveToGpt'), run: () => moveStepToAnotherGpt(s.id) },
      { label: t('context.delete'), danger: true, run: () => deleteStep(s.id) }
    ]));
    const imgEl = w.querySelector('.gpt-step-img');
    if (imgEl) imgEl.addEventListener('click', (ev) => { ev.stopPropagation(); openLightbox(s.img); });
    stepsList.appendChild(w);
  });
  let btnNameAllSteps = document.getElementById('btnNameAllSteps');
  if (!btnNameAllSteps) {
    btnNameAllSteps = document.createElement('button');
    btnNameAllSteps.id = 'btnNameAllSteps';
    btnNameAllSteps.type = 'button';
    btnNameAllSteps.className = 'secondary full-width dashed-btn';
    btnNameAllSteps.textContent = t('library.nameAllSteps');
    btnNameAllSteps.addEventListener('click', () => {
      const current = gptLibrary.find(x => x.id === currentViewingGptId && !x.deleted);
      if (current) autoNameGptSteps(current, { onlyGeneric: true, toast: true });
    });
    btnOpenAddStep.parentElement.insertBefore(btnNameAllSteps, btnOpenAddStep);
  }
  btnNameAllSteps.textContent = t('library.nameAllSteps');
  btnNameAllSteps.classList.toggle('hidden', !visibleSteps.some(s => isGenericStepLabel(s.label)));
  enableDragAndDrop(gpt, 'gpt');
}

async function saveGPT() {
    const id=editIdInput.value;
    let name=gptNameInput.value.trim(), fid=gptFolderSelect.value, p=gptPromptInput.value.trim(), n=gptNoteInput.value.trim(), tags=parseTagsInput(gptTagsInput.value);
    if(!p)return alert(t('alerts.missingNamePrompt'));
    if(!name) name = await generateTitleForPrompt(p) || p.slice(0, 48);
    const similar = findSimilarGpt(`${name} ${p}`, id);
    if (similar && !await customConfirm(t('alerts.confirmSimilarSave', { name: similar.gpt.name, percent: Math.round(similar.score * 100) }))) return;
    const existing = id ? gptLibrary.find(x => x.id === id) : null;
    const coverImg = getPreviewValue('previewGpt', existing?.coverImg);
    let savedId = id;
    if(id){
        const i=gptLibrary.findIndex(x=>x.id===id);
        if(i!==-1) gptLibrary[i]={...gptLibrary[i],name,folderId:fid,tags:tags,note:n,prompt:p,coverImg,updated:Date.now()};
        if(currentViewingGptId===id) showDetailView(gptLibrary[i]);
    } else {
        const now=Date.now();
        savedId = `g_${now}`;
        gptLibrary.unshift({id:savedId,name,folderId:fid,tags:tags,note:n,prompt:p,coverImg,steps:[],created:now,updated:now,usageCount:0,deleted:false});
    }
    await chrome.storage.local.set({gptLibrary});
    enrichGptInBackground(savedId);
    editModal.classList.add('hidden');
    if(!currentViewingGptId) {
        renderLibrary(searchLibrary.value);
    } else {
        const g = gptLibrary.find(g => g.id === currentViewingGptId);
        if(g) showDetailView(g);
    }
    showToast(t('toast.saved'));
}

async function generateTitleForPrompt(prompt) {
  try {
    const data = await callLocalAiJson(t('ai.titleSystem'), t('ai.titlePrompt', { prompt: prompt.slice(0, 5000) }));
    return String(data.title || '').trim().slice(0, 80);
  } catch (e) {
    console.warn('Titre IA non disponible', e);
    return '';
  }
}

function isGenericStepLabel(label) {
  const text = String(label || '').trim();
  return !text || /^(étape|etape|step)\s+\d+$/i.test(text);
}

function stepDisplayLabel(step, index) {
  return step?.label || `${t('modal.step.title')} ${index + 1}`;
}

function formatStepAiLabel(index, title) {
  return title ? `${t('modal.step.title')} ${index + 1} - ${title}` : '';
}

async function generateStepLabelFromAi(content, index, force = false) {
  if (!force && !localAiSettings.autoNameSteps) return '';
  try {
    const title = await callStepTitle(content);
    return formatStepAiLabel(index, title);
  } catch (e) {
    console.warn('Nom IA étape non disponible', e);
    return '';
  }
}

async function renameGptStep(id) {
  const g = gptLibrary.find(x => x.id === currentViewingGptId);
  const step = g?.steps.find(s => s.id === id);
  if (!g || !step) return;
  const wrapper = document.querySelector(`.step-item-wrapper[data-step-id="${CSS.escape(id)}"]`);
  const badge = wrapper?.querySelector('.step-badge.step');
  if (!badge) return openStepModal(step);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-step-title-input';
  input.value = step.label || '';
  badge.replaceWith(input);
  input.focus();
  input.select();
  const finish = async (apply) => {
    if (!input.isConnected) return;
    if (apply) {
      step.label = input.value.trim();
      g.updated = Date.now();
      await chrome.storage.local.set({ gptLibrary });
      showToast(t('toast.saved'));
    }
    showDetailView(g);
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function nameGptStepWithAi(id) {
  const g = gptLibrary.find(x => x.id === currentViewingGptId);
  const step = g?.steps.find(s => s.id === id);
  if (!g || !step?.content) return;
  const visibleIndex = (g.steps || []).filter(s => !s.deleted).findIndex(s => s.id === id);
  const label = await generateStepLabelFromAi(step.content, Math.max(visibleIndex, 0), true);
  if (!label) return alert(t('alerts.localAiNoSuggestion'));
  step.label = label;
  g.updated = Date.now();
  await chrome.storage.local.set({ gptLibrary });
  showDetailView(g);
  showToast(t('toast.saved'));
}

async function renameImgStep(id) {
  const img = imageLibrary.find(x => x.id === currentViewingImgId);
  const step = img?.steps.find(s => s.id === id);
  if (!img || !step) return;
  const name = await customInput({ title: t('context.rename'), label: t('modal.imgStep.action'), value: step.label || '' });
  if (name === null) return;
  step.label = name;
  img.updated = Date.now();
  await chrome.storage.local.set({ imageLibrary });
  showImgDetail(img);
}

async function nameImgStepWithAi(id) {
  const img = imageLibrary.find(x => x.id === currentViewingImgId);
  const step = img?.steps.find(s => s.id === id);
  if (!img || !step?.content) return;
  const visibleIndex = (img.steps || []).filter(s => !s.deleted).findIndex(s => s.id === id);
  const label = await generateStepLabelFromAi(step.content, Math.max(visibleIndex, 0), true);
  if (!label) return alert(t('alerts.localAiNoSuggestion'));
  step.label = label;
  img.updated = Date.now();
  await chrome.storage.local.set({ imageLibrary });
  showImgDetail(img);
  showToast(t('toast.saved'));
}

function setProcessingStep(kind, id, active) {
  const key = `${kind}-step:${id}`;
  if (active) processingItems.add(key);
  else processingItems.delete(key);
  document.querySelector(`.step-item-wrapper[data-step-id="${CSS.escape(id)}"]`)?.classList.toggle('processing', active);
}

async function autoNameGptStepSilent(gpt, step) {
  if (!gpt || !step?.content || !isGenericStepLabel(step.label)) return false;
  const visibleIndex = (gpt.steps || []).filter(s => !s.deleted).findIndex(s => s.id === step.id);
  setProcessingStep('gpt', step.id, true);
  try {
    const title = await callStepTitle(step.content);
    if (!title) return false;
    step.label = formatStepAiLabel(Math.max(visibleIndex, 0), title);
    gpt.updated = Date.now();
    await chrome.storage.local.set({ gptLibrary });
    if (currentViewingGptId === gpt.id) showDetailView(gpt);
    return true;
  } catch (e) {
    console.warn('Nom IA étape ignoré', e);
    return false;
  } finally {
    setProcessingStep('gpt', step.id, false);
  }
}

async function autoNameImgStepSilent(img, step) {
  if (!img || !step?.content || !isGenericStepLabel(step.label)) return false;
  const visibleIndex = (img.steps || []).filter(s => !s.deleted).findIndex(s => s.id === step.id);
  setProcessingStep('img', step.id, true);
  try {
    const title = await callStepTitle(step.content);
    if (!title) return false;
    step.label = formatStepAiLabel(Math.max(visibleIndex, 0), title);
    img.updated = Date.now();
    await chrome.storage.local.set({ imageLibrary });
    if (currentViewingImgId === img.id) showImgDetail(img);
    return true;
  } catch (e) {
    console.warn('Nom IA étape image ignoré', e);
    return false;
  } finally {
    setProcessingStep('img', step.id, false);
  }
}

async function autoNameGptSteps(gpt, { onlyGeneric = true, toast = true } = {}) {
  if (!gpt) return 0;
  const steps = (gpt.steps || []).filter(s => !s.deleted && s.content && (!onlyGeneric || isGenericStepLabel(s.label)));
  let named = 0;
  for (const step of steps) {
    const visibleIndex = (gpt.steps || []).filter(s => !s.deleted).findIndex(s => s.id === step.id);
    setProcessingStep('gpt', step.id, true);
    try {
      const title = await callStepTitle(step.content);
      if (title) {
        step.label = formatStepAiLabel(Math.max(visibleIndex, 0), title);
        named++;
      }
    } catch (e) {
      console.warn('Nom IA étape ignoré', e);
    } finally {
      setProcessingStep('gpt', step.id, false);
    }
  }
  if (named) {
    gpt.updated = Date.now();
    await chrome.storage.local.set({ gptLibrary });
    if (currentViewingGptId === gpt.id) showDetailView(gpt);
    else renderLibrary(searchLibrary.value);
  }
  if (toast) showToast(t('toast.stepsNamed', { count: named }));
  return named;
}

async function autoNameImageSteps(img, { onlyGeneric = true } = {}) {
  if (!img) return 0;
  const steps = (img.steps || []).filter(s => !s.deleted && s.content && (!onlyGeneric || isGenericStepLabel(s.label)));
  let named = 0;
  for (const step of steps) {
    const visibleIndex = (img.steps || []).filter(s => !s.deleted).findIndex(s => s.id === step.id);
    setProcessingStep('img', step.id, true);
    try {
      const title = await callStepTitle(step.content);
      if (title) {
        step.label = formatStepAiLabel(Math.max(visibleIndex, 0), title);
        named++;
      }
    } catch (e) {
      console.warn('Nom IA étape image ignoré', e);
    } finally {
      setProcessingStep('img', step.id, false);
    }
  }
  if (named) {
    img.updated = Date.now();
    await chrome.storage.local.set({ imageLibrary });
    if (currentViewingImgId === img.id) showImgDetail(img);
    else renderImageGallery(searchImages.value);
  }
  return named;
}

async function autoNameImportedSteps(importedGpts = [], importedImages = []) {
  let named = 0;
  for (const gpt of importedGpts) named += await autoNameGptSteps(gpt, { onlyGeneric: true, toast: false });
  for (const img of importedImages) named += await autoNameImageSteps(img, { onlyGeneric: true });
  if (named) showToast(t('toast.stepsNamed', { count: named }));
}

async function enrichGptInBackground(id) {
  const g = gptLibrary.find(x => x.id === id);
  if (!g) return;
  let changed = false;
  try {
    if ((!g.tags || g.tags.length === 0) && g.prompt) {
      const tags = await generateTagsForGpt(g, 3);
      if (tags.length) { g.tags = tags; changed = true; }
    }
    if (!g.note && g.prompt) {
      const data = await callLocalAiJson(t('ai.noteSystem'), t('ai.notePrompt', { prompt: g.prompt.slice(0, 8000) }));
      const note = String(data.note || '').trim();
      if (note) { g.note = note; changed = true; }
    }
    if (changed) {
      g.updated = Date.now();
      await chrome.storage.local.set({ gptLibrary });
      if (currentViewingGptId === id) showDetailView(g);
      else renderLibrary(searchLibrary.value);
    }
  } catch (e) {
    console.warn('Enrichissement IA passif ignoré', e);
  }
}

function openMainModal(g, options = {}){
    editModal.classList.remove('hidden');
    pendingSuggestedTags = [];
    if (suggestedTagsBox) suggestedTagsBox.classList.add('hidden');
    const sel=document.getElementById('gptFolderSelect');
    sel.innerHTML=`<option value="">${t('modal.folder.none')}</option>`;
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
    focusModalInput(editModal, options.focus === 'tags' ? gptTagsInput : gptNameInput);
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
    focusModalInput(stepModal, stepLabelInput);
}

async function saveStep(){
    const g=gptLibrary.find(x=>x.id===currentViewingGptId);if(!g)return;
    const id=stepEditIdInput.value,n=stepNoteInput.value,c=stepContentInput.value;
    let l=stepLabelInput.value.trim();
    if(!c)return;
    const existingStep = id ? g.steps.find(s => s.id === id) : null;
    const img = getPreviewValue('previewGptStep', existingStep?.img);
    const visibleIndex = id
      ? Math.max((g.steps || []).filter(s => !s.deleted).findIndex(s => s.id === id), 0)
      : (g.steps || []).filter(s => !s.deleted).length;
    const shouldAutoName = localAiSettings.autoNameSteps && isGenericStepLabel(l);
    let savedStepId = id;
    if(id){
        const i=g.steps.findIndex(s=>s.id===id);
        if(i!==-1) g.steps[i]={...g.steps[i],label:l,note:n,content:c,img};
    } else {
        savedStepId = `s_${Date.now()}`;
        g.steps.push({id:savedStepId,label:l,note:n,content:c,img,deleted:false});
    }
    g.updated = Date.now();
    await chrome.storage.local.set({gptLibrary});
    stepModal.classList.add('hidden');
    showDetailView(g);
    showToast(t('toast.saved'));
    if (shouldAutoName) {
        const step = g.steps.find(s => s.id === savedStepId);
        if (step) autoNameGptStepSilent(g, step);
    }
}

async function deleteGPT(id) {
    if (!await customConfirm(t('alerts.confirmTrashGpt'))) return;
    const gpt = gptLibrary.find(g => g.id === id);
    if (gpt) {
        gpt.deleted = true;
        gpt.updated = Date.now();
        await chrome.storage.local.set({ gptLibrary });
        renderLibrary(searchLibrary.value);
    }
}

async function deleteCurrentGPT() {
    if (!currentViewingGptId) return;
    const id = currentViewingGptId;
    await deleteGPT(id);
    if (gptLibrary.find(g => g.id === id)?.deleted) showListView();
}

async function deleteStep(id){
    if(!await customConfirm(t('alerts.confirmDeleteStep')))return;
    const g=gptLibrary.find(x=>x.id===currentViewingGptId);
    if (g) {
        const step = g.steps.find(s => s.id === id);
        if (step) {
            step.deleted = true;
            g.updated = Date.now();
        }
        await chrome.storage.local.set({gptLibrary});
        showDetailView(g);
    }
}

async function duplicateStep(id) {
    const g = gptLibrary.find(x => x.id === currentViewingGptId);
    if (!g) return;
    const idx = g.steps.findIndex(s => s.id === id);
    if (idx === -1) return;
    const copy = structuredClone(g.steps[idx]);
    copy.id = `s_${Date.now()}`;
    copy.label = t('labels.copyName', { name: copy.label || t('modal.step.title') });
    copy.deleted = false;
    g.steps.splice(idx + 1, 0, copy);
    g.updated = Date.now();
    await chrome.storage.local.set({ gptLibrary });
    showDetailView(g);
}

async function moveStepToAnotherGpt(id) {
    const source = gptLibrary.find(x => x.id === currentViewingGptId);
    if (!source) return;
    const step = source.steps.find(s => s.id === id);
    if (!step) return;
    const choices = gptLibrary.filter(g => !g.deleted && g.id !== source.id);
    if (!choices.length) return alert(t('alerts.noTargetGpt'));
    pendingMoveStepId = id;
    moveStepSelect.innerHTML = '';
    choices.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      moveStepSelect.appendChild(opt);
    });
    moveStepModal.classList.remove('hidden');
    focusModalInput(moveStepModal, moveStepSelect);
}

async function confirmMoveStepToAnotherGpt() {
    const source = gptLibrary.find(x => x.id === currentViewingGptId);
    const step = source?.steps.find(s => s.id === pendingMoveStepId);
    const target = gptLibrary.find(g => g.id === moveStepSelect.value && !g.deleted);
    if (!source || !step || !target) return alert(t('alerts.targetGptNotFound'));
    target.steps = target.steps || [];
    target.steps.push({ ...structuredClone(step), id: `s_${Date.now()}`, deleted: false });
    step.deleted = true;
    source.updated = Date.now();
    target.updated = Date.now();
    await chrome.storage.local.set({ gptLibrary });
    pendingMoveStepId = null;
    moveStepModal.classList.add('hidden');
    showDetailView(source);
    showToast(t('toast.saved'));
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
            item.updated = Date.now();
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

async function saveImgCategory() { const n = imgCategoryNameInput.value.trim(); if(!n) return; imgCategories.push({id:`cat_${Date.now()}`, name:n}); await chrome.storage.local.set({imgCategories}); imgCategoryModal.classList.add('hidden'); renderImgFilters(); showToast(t('toast.saved')); }
async function renameImgCategory(id) { const c=imgCategories.find(x=>x.id===id); if(!c)return; const n=await customInput({ title: t('context.rename'), label: t('prompts.renameCategory'), value: c.name }); if(n===null||!n.trim())return; c.name=n.trim(); await chrome.storage.local.set({imgCategories}); renderImgFilters(); renderImageGallery(searchImages.value); }
async function duplicateImgCategory(id) {
  const c=imgCategories.find(x=>x.id===id); if(!c)return;
  const now=Date.now(), newId=`cat_${now}`;
  imgCategories.push({id:newId, name:t('labels.copyName', { name: c.name })});
  const copies=imageLibrary.filter(i=>!i.deleted&&i.categoryId===id).map((img,idx)=>cloneImage(img,newId,now+idx+1));
  imageLibrary.unshift(...copies);
  await chrome.storage.local.set({imgCategories,imageLibrary});
  currentImgCategory=newId;
  renderImgFilters(); renderImageGallery(searchImages.value);
}
async function deleteImgCategory(id) { if(!await customConfirm(t('alerts.confirmDeleteCategory'))) return; imgCategories=imgCategories.filter(c=>c.id!==id); imageLibrary.forEach(i=>{ if(i.categoryId===id){ i.categoryId=""; i.updated=Date.now(); } }); await chrome.storage.local.set({imgCategories,imageLibrary}); if(currentImgCategory===id)currentImgCategory='all'; renderImgFilters(); renderImageGallery(searchImages.value); }

function renderImgFilters() {
  const counts = getImageFilterCounts();
  imgCategoryList.innerHTML='';
  createChip(imgCategoryList, chipLabel(t('filters.all'), counts.categories.all), 'all', currentImgCategory, (id)=>{currentImgCategory=id; renderImageGallery(searchImages.value);});
  createChip(imgCategoryList, chipLabel(t('filters.unclassified'), counts.categories.none), 'none', currentImgCategory, (id)=>{currentImgCategory=id; renderImageGallery(searchImages.value);});
  imgCategories.forEach(c=>{
    const b=document.createElement('button'); b.className=`folder-chip ${currentImgCategory===c.id?'active':''}`; b.textContent=chipLabel(c.name, counts.categories.byId.get(c.id) || 0);
    b.title = t('context.rename');
    b.onclick=()=>{currentImgCategory=c.id; renderImgFilters(); renderImageGallery(searchImages.value);}
    b.ondblclick=(e)=>{e.preventDefault(); e.stopPropagation(); renameImgCategory(c.id);}
    b.oncontextmenu=(e)=>showContextMenu(e, [
      { label: t('context.rename'), run: () => renameImgCategory(c.id) },
      { label: t('context.duplicate'), run: () => duplicateImgCategory(c.id) },
      { label: t('context.delete'), danger: true, run: () => deleteImgCategory(c.id) }
    ]);
    imgCategoryList.appendChild(b);
  });

  imgModelFilterList.innerHTML='';
  createChip(imgModelFilterList, chipLabel(t('filters.all'), counts.models.all), 'all', currentModelFilter, (id)=>{currentModelFilter=id; renderImageGallery(searchImages.value);});
  imgModels.forEach(m=>{ createChip(imgModelFilterList, chipLabel(m, counts.models.byId.get(m) || 0), m, currentModelFilter, (id)=>{currentModelFilter=id; renderImageGallery(searchImages.value);}); });
}

function getImageFilterCounts() {
  const visible = imageLibrary.filter(i => !i.deleted);
  return {
    categories: {
      all: visible.length,
      none: visible.filter(i => !i.categoryId).length,
      byId: new Map(imgCategories.map(c => [c.id, visible.filter(i => i.categoryId === c.id).length]))
    },
    models: {
      all: visible.length,
      byId: new Map(imgModels.map(m => [m, visible.filter(i => i.model === m).length]))
    }
  };
}

function openModelsManager() { modelsManageModal.classList.remove('hidden'); renderModelsList(); }
function renderModelsList() { modelsListContainer.innerHTML=''; imgModels.forEach(m=>{ const d=document.createElement('div'); d.className='model-item'; d.innerHTML=`<span>${escapeHtml(m)}</span><button class="icon-btn danger small-icon" style="width:20px;height:20px">×</button>`; d.querySelector('button').onclick=async()=>{if(await customConfirm(t('alerts.confirmDeleteModel'))){imgModels=imgModels.filter(x=>x!==m); await chrome.storage.local.set({imgModels}); renderModelsList(); renderImgFilters();}}; modelsListContainer.appendChild(d); }); }
async function addNewModel(){const v=newModelNameInput.value.trim();if(!v)return;if(!imgModels.includes(v)){imgModels.push(v);await chrome.storage.local.set({imgModels});newModelNameInput.value='';renderModelsList();renderImgFilters();}}

function cloneImage(img, categoryId = img.categoryId || "", timestamp = Date.now()) {
  const copy = structuredClone(img);
  copy.id = `i_${timestamp}`;
  copy.title = t('labels.copyName', { name: img.title });
  copy.categoryId = categoryId;
  copy.created = timestamp;
  copy.updated = timestamp;
  copy.usageCount = 0;
  copy.deleted = false;
  copy.steps = (copy.steps || []).map((s, idx) => ({ ...s, id: `is_${timestamp}_${idx}`, deleted: false }));
  return copy;
}

async function duplicateImg(id) {
  const img = imageLibrary.find(i => i.id === id);
  if (!img) return;
  imageLibrary.unshift(cloneImage(img));
  await chrome.storage.local.set({ imageLibrary });
  renderImageGallery(searchImages.value);
}

async function loadImageLibrary() { 
    const r = await chrome.storage.local.get(['imageLibrary']); 
    imageLibrary = r.imageLibrary || []; 
    imageLibrary.forEach(i => {
        if(!i.categoryId) i.categoryId="";
        if(i.deleted === undefined) i.deleted = false;
        if(!i.steps) i.steps = [];
        if(!Array.isArray(i.tags)) i.tags = [];
        normalizeItemDates(i);
        i.steps.forEach(s => { 
            if(s.deleted === undefined) s.deleted = false; 
        });
    }); 
    renderImgFilters();
    renderImageGallery(); 
}

function getVisibleImages(filter = '') {
    const term=filter.toLowerCase().trim();
    let sub = imageLibrary.filter(i => !i.deleted);
    if(currentImgCategory==='none') sub=sub.filter(i=>!i.categoryId);
    else if(currentImgCategory!=='all') sub=sub.filter(i=>i.categoryId===currentImgCategory);
    
    if(currentModelFilter!=='all') sub=sub.filter(i=>i.model===currentModelFilter);
    
    // Recherche : titre seul ou recherche avancée selon l'option utilisateur.
    const filtered = !term ? sub : sub.filter(i => {
      if (i.title && i.title.toLowerCase().includes(term)) return true;
      if (imgSearchMode === 'title') return false;
      if (i.tags && i.tags.some(t => t.toLowerCase().includes(term))) return true;
      if (i.prompt && i.prompt.toLowerCase().includes(term)) return true;
      if (i.params && i.params.toLowerCase().includes(term)) return true;
      if (i.model && i.model.toLowerCase().includes(term)) return true;
      if (i.steps && i.steps.some(s => !s.deleted && (
        (s.label && s.label.toLowerCase().includes(term)) ||
        (s.content && s.content.toLowerCase().includes(term))
      ))) return true;
      return false;
    });
    return sortItems(filtered, imgSortMode, 'title');
}

function getImageEmptyState(filter = '') {
    const term = String(filter || '').trim();
    let title = t('empty.imagesTitle');
    let hint = t('empty.imagesHint');
    if (term) {
      title = t('empty.searchTitle', { term: filterDisplayTerm(term) });
      hint = t('empty.searchHint');
    } else if (currentImgCategory !== 'all' || currentModelFilter !== 'all') {
      title = t('empty.folderTitle');
      hint = t('empty.imagesFilteredHint');
    }
    return `<div class="empty-state rich-empty gallery-empty"><div class="empty-icon">∅</div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(hint)}</span></div>`;
}

function renderImageGallery(filter='') {
    imageGalleryGrid.innerHTML='';
    const filtered = getVisibleImages(filter);
    if(filtered.length===0){imageGalleryGrid.innerHTML=getImageEmptyState(filter);return;}

    filtered.forEach(img => {
        const card = document.createElement('div'); card.className = 'gallery-card'; card.dataset.id=img.id;
        if(selectedIds.has(img.id)) card.classList.add('selected-card');
        if(processingItems.has(`image:${img.id}`)) card.classList.add('processing');

        let media = '';
        if(img.imgBefore && img.imgAfter) {
          media = `<div class="compare-container"><img src="${img.imgAfter}" class="compare-img img-before"><img src="${img.imgBefore}" class="compare-img img-after"><div class="compare-handle"></div></div>`;
          card.addEventListener('mousemove', (e) => { const r=card.getBoundingClientRect(); const x=Math.max(0,Math.min(e.clientX-r.left,r.width)); card.style.setProperty('--position',`${(x/r.width)*100}%`); });
          card.addEventListener('mouseleave', () => card.style.setProperty('--position', `50%`));
        } else {
          media = `<img src="${img.imgAfter||img.imgBefore||'assets/icon48.png'}" style="width:100%;height:100%;object-fit:cover">`;
        }
        const cnt = (img.steps&&img.steps.filter(s => !s.deleted).length>0)?`<span class="gallery-badge-count">+${img.steps.filter(s => !s.deleted).length}</span>`:'';
        const usageHtml = (img.usageCount || 0) > 0 ? `<span class="usage-badge gallery-usage" title="${t('usage.countTitle')}">↗ ${img.usageCount}</span>` : '';
        const tagsHtml = renderTagsHtml(img.tags || []);
        card.innerHTML = `<button class="card-duplicate-btn icon-btn small-icon" title="${t('context.duplicate')}">⧉</button><button class="card-delete-btn danger icon-btn small-icon">&times;</button>${media}${cnt}${usageHtml}<div class="gallery-overlay"><div class="gallery-title">${escapeHtml(img.title)}</div><div class="gallery-model-tag">${escapeHtml(img.model)}</div><div class="tags-container gallery-tags">${tagsHtml}</div></div>`;
        bindClickableTags(card, searchImages, renderImageGallery);
        
        card.querySelector('.card-duplicate-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            duplicateImg(img.id);
        });

        card.querySelector('.card-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteImg(img.id);
        });

        card.addEventListener('contextmenu', (e) => showContextMenu(e, [
          { label: t('context.rename'), run: () => openImgModal(img) },
          { label: t('context.duplicate'), run: () => duplicateImg(img.id) },
          { label: t('context.copyPrompt'), run: () => copyToClipboard(img.prompt || '', null, { type: 'image', id: img.id }) },
          { label: t('context.changeCategory'), run: () => { forceSingleSelection(img.id, 'image'); openBulkMoveModal(); } },
          { label: t('context.delete'), danger: true, run: () => deleteImg(img.id) }
        ]));

        card.addEventListener('click', (e) => { if(!toggleSelection(e, img.id, 'image')) showImgDetail(img); });
        imageGalleryGrid.appendChild(card);
    });
    applyFinderHighlight();
    setTimeout(() => window.scrollTo(0, scrollPositions.gallery), 0);
}

function showImgDetail(img) {
  scrollPositions.gallery = window.scrollY;
  currentViewingImgId=img.id; 
  imgGalleryView.classList.add('hidden'); 
  imgDetailView.classList.remove('hidden');
  imgDetailTitle.textContent=img.title; 
  imgDetailTitle.ondblclick = () => openImgModal(img);
  imgDetailModel.textContent=img.model;
  imgShowcase.innerHTML='';
  const hasBothCover = !!(img.imgBefore && img.imgAfter);
  const galleryItems = currentGalleryLightboxItems();
  const galleryIndex = galleryItems.findIndex(item => item.id === img.id);
  if(img.imgBefore){
    const i=document.createElement('img');
    i.src=img.imgBefore; i.className="showcase-img";
    i.onclick = hasBothCover
      ? () => openLightbox(img.imgBefore, img.imgAfter, galleryItems, galleryIndex)
      : () => openLightbox(img.imgBefore, '', galleryItems, galleryIndex);
    imgShowcase.appendChild(i);
  }
  if(img.imgAfter){
    const i=document.createElement('img');
    i.src=img.imgAfter; i.className="showcase-img";
    i.onclick = hasBothCover
      ? () => openLightbox(img.imgBefore, img.imgAfter, galleryItems, galleryIndex)
      : () => openLightbox(img.imgAfter, '', galleryItems, galleryIndex);
    imgShowcase.appendChild(i);
  }
  imgDetailPrompt.textContent=img.prompt; 
  imgDetailPrompt.ondblclick = () => openImgModal(img);
  imgParamsContainer.classList.toggle('hidden',!img.params); 
  imgDetailParams.textContent=img.params||"";
  const detailTagBox = document.createElement('div');
  detailTagBox.className = 'tags-container img-detail-tags';
  detailTagBox.innerHTML = renderTagsHtml(img.tags || []);
  bindClickableTags(detailTagBox, searchImages, (tag) => { showImgGallery(); renderImageGallery(tag); });
  imgShowcase.appendChild(detailTagBox);
  imgStepsList.innerHTML='';

  const visibleImgSteps = (img.steps||[]).filter(s => !s.deleted);
  visibleImgSteps.forEach((s, idx)=>{
    const originalIndex = img.steps.findIndex(os => os.id === s.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'step-item-wrapper';
    wrapper.setAttribute('draggable', 'true');
    wrapper.dataset.index = originalIndex;
    wrapper.dataset.stepId = s.id;
    if (processingItems.has(`img-step:${s.id}`)) wrapper.classList.add('processing');

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

    c.innerHTML=`<div class="step-header"><div><span class="step-drag-handle">☰</span> <span class="step-badge step">${escapeHtml(stepDisplayLabel(s, idx))}</span></div><div><button class="step-actions-btn edit-img-step">✎</button><button class="step-actions-btn del">&times;</button></div></div>${toolbar}${imH}<div class="prompt-preview">${escapeHtml(s.content)}</div><button class="copy-prompt-btn">${t('library.copy')}</button>`;
    c.querySelector('.copy-prompt-btn').onclick=(e)=>copyToClipboard(s.content,e.target, { type: 'image', id: currentViewingImgId });
    c.querySelector('.del').onclick=()=>deleteImgStep(s.id);
    c.querySelector('.edit-img-step').onclick=()=>openImgStepModal(s);
    c.addEventListener('contextmenu', (e) => showContextMenu(e, [
      { label: t('context.rename'), run: () => renameImgStep(s.id) },
      { label: t('context.aiNameStep'), run: () => nameImgStepWithAi(s.id) },
      { label: t('context.copyStep'), run: () => copyToClipboard(s.content, c.querySelector('.copy-prompt-btn'), { type: 'image', id: currentViewingImgId }) },
      { label: t('context.duplicate'), run: () => duplicateImgStep(s.id) },
      { label: t('context.delete'), danger: true, run: () => deleteImgStep(s.id) }
    ]));

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
  imgCategorySelect.innerHTML=`<option value="">${t('modal.folder.none')}</option>`; 
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
      imgTagsInput.value=(i.tags||[]).join(', ');
      imgParamsInput.value=i.params||""; 
      if(i.imgBefore) setPreview('previewBefore',i.imgBefore); 
      if(i.imgAfter) setPreview('previewAfter',i.imgAfter); 
  } else { 
      imgEditId.value=""; 
      imgNameInput.value=""; 
      imgCategorySelect.value=(currentImgCategory!=='all'&&currentImgCategory!=='none')?currentImgCategory:""; 
      imgPromptInput.value=""; 
      imgTagsInput.value="";
      imgParamsInput.value=""; 
  } 
  focusModalInput(imgModal, imgNameInput);
}

async function saveImg() {
  const id=imgEditId.value, ti=imgNameInput.value.trim(), cat=imgCategorySelect.value, mo=imgModelSelect.value, pr=imgPromptInput.value.trim(), tags=parseTagsInput(imgTagsInput.value), pa=imgParamsInput.value.trim();
  const existing = id ? imageLibrary.find(i=>i.id===id) : null;
  const ib = getPreviewValue('previewBefore', existing?.imgBefore);
  const ia = getPreviewValue('previewAfter', existing?.imgAfter);
  if(!ti) return alert(t('alerts.missingTitle'));
  let savedId = id;
  if(id){
      const idx=imageLibrary.findIndex(x=>x.id===id);
      if(idx!==-1){
          imageLibrary[idx]={...imageLibrary[idx],title:ti,categoryId:cat,model:mo,prompt:pr,tags,params:pa,imgBefore:ib,imgAfter:ia,updated:Date.now()};
          if(currentViewingImgId===id) showImgDetail(imageLibrary[idx]);
      }
  } else {
      const now=Date.now();
      savedId = `i_${now}`;
      imageLibrary.unshift({id:savedId,title:ti,categoryId:cat,model:mo,prompt:pr,tags,params:pa,imgBefore:ib,imgAfter:ia,steps:[],created:now,updated:now,usageCount:0,deleted:false});
  }
  await chrome.storage.local.set({imageLibrary});
  enrichImageInBackground(savedId);
  imgModal.classList.add('hidden');
  if(!currentViewingImgId) renderImageGallery(searchImages.value);
  showToast(t('toast.saved'));
}

async function enrichImageInBackground(id) {
  const img = imageLibrary.find(x => x.id === id);
  if (!img || (img.tags && img.tags.length > 0) || !img.prompt) return;
  try {
    const tags = await generateTagsForImage(img, 3);
    if (!tags.length) return;
    img.tags = tags;
    img.updated = Date.now();
    await chrome.storage.local.set({ imageLibrary });
    if (currentViewingImgId === id) showImgDetail(img);
    else renderImageGallery(searchImages.value);
  } catch (e) {
    console.warn('Auto-tagging image ignoré', e);
  }
}

async function generateTagsForGpt(gpt, limit = 5) {
  if (!gpt?.prompt) return [];
  const data = await callLocalAiJson(t('ai.tagsSystem'), t('ai.tagsPrompt', { prompt: gpt.prompt.slice(0, 8000) }));
  return (data.tags || []).map(tag => String(tag).trim().replace(/^#/, '')).filter(Boolean).slice(0, limit);
}

async function generateTagsForImage(img, limit = 3) {
  if (!img?.prompt) return [];
  const data = await callLocalAiJson(
    t('ai.imageTagsSystem'),
    t('ai.imageTagsPrompt', {
      title: img.title || '',
      model: img.model || '',
      prompt: String(img.prompt || '').slice(0, 7000),
      params: String(img.params || '').slice(0, 2000)
    })
  );
  return (data.tags || []).map(tag => String(tag).trim().replace(/^#/, '')).filter(Boolean).slice(0, limit);
}

function openImgStepModal(s){
    imgStepModal.classList.remove('hidden');
    document.getElementById('imgStepEditId').value = s ? s.id : '';
    document.getElementById('imgStepLabel').value = s ? s.label : '';
    document.getElementById('imgStepContent').value = s ? s.content : '';
    setPreview('previewStep', s && s.img ? s.img : '');
    setPreview('previewStepAfter', s && s.imgAfter ? s.imgAfter : '');
    focusModalInput(imgStepModal, document.getElementById('imgStepLabel'));
}

async function saveImgStep(){
    const img=imageLibrary.find(x=>x.id===currentViewingImgId);if(!img)return;
    const id = document.getElementById('imgStepEditId').value;
    let l=document.getElementById('imgStepLabel').value.trim();
    const c=document.getElementById('imgStepContent').value;
    const existingStep = id ? img.steps.find(s=>s.id===id) : null;
    const im = getPreviewValue('previewStep', existingStep?.img);
    const imAfter = getPreviewValue('previewStepAfter', existingStep?.imgAfter);

    if(!c)return;
    const visibleIndex = id
      ? Math.max((img.steps || []).filter(s => !s.deleted).findIndex(s => s.id === id), 0)
      : (img.steps || []).filter(s => !s.deleted).length;
    const shouldAutoName = localAiSettings.autoNameSteps && isGenericStepLabel(l);
    let savedStepId = id;

    if(id){ // Editing existing step
        const step = img.steps.find(s => s.id === id);
        if(step){
            step.label = l;
            step.content = c;
            step.img = im;
            step.imgAfter = imAfter;
        }
    } else { // New step
        savedStepId = `is_${Date.now()}`;
        img.steps.push({id:savedStepId,label:l,content:c,img:im, imgAfter: imAfter, deleted: false});
    }
    img.updated = Date.now();

    await chrome.storage.local.set({imageLibrary});
    imgStepModal.classList.add('hidden');
    showImgDetail(img);
    showToast(t('toast.saved'));
    if (shouldAutoName) {
        const step = img.steps.find(s => s.id === savedStepId);
        if (step) autoNameImgStepSilent(img, step);
    }
}

async function deleteImg(id) {
    if(!await customConfirm(t('alerts.confirmTrashImage'))) return;
    const img = imageLibrary.find(i => i.id === id);
    if(img) {
        img.deleted = true;
        img.updated = Date.now();
        await chrome.storage.local.set({ imageLibrary });
        renderImageGallery(searchImages.value);
    }
}

async function deleteCurrentImg() {
    if(!currentViewingImgId) return;
    const id = currentViewingImgId;
    await deleteImg(id);
    if (imageLibrary.find(i => i.id === id)?.deleted) showImgGallery();
}

async function deleteImgStep(id){
    if(!await customConfirm(t('alerts.confirmDeleteStep')))return;
    const img=imageLibrary.find(x=>x.id===currentViewingImgId);
    if(img){
        const step = img.steps.find(s => s.id === id);
        if (step) step.deleted = true;
        img.updated = Date.now();
        await chrome.storage.local.set({imageLibrary});
        showImgDetail(img);
    }
}

async function duplicateImgStep(id) {
    const img = imageLibrary.find(x => x.id === currentViewingImgId);
    if (!img) return;
    const idx = img.steps.findIndex(s => s.id === id);
    if (idx === -1) return;
    const copy = structuredClone(img.steps[idx]);
    copy.id = `is_${Date.now()}`;
    copy.label = t('labels.copyName', { name: copy.label || t('modal.imgStep.title') });
    copy.deleted = false;
    img.steps.splice(idx + 1, 0, copy);
    img.updated = Date.now();
    await chrome.storage.local.set({ imageLibrary });
    showImgDetail(img);
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
function openLightbox(src, srcAfter, items = [], index = -1) {
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
  lightboxItems = items;
  lightboxIndex = index;
  applyLightboxTransform();
  lightboxModal.classList.remove('hidden');
}

function navigateLightbox(delta) {
  if (!lightboxItems.length || lightboxIndex < 0) return;
  lightboxIndex = (lightboxIndex + delta + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex];
  openLightbox(item.src, item.srcAfter, lightboxItems, lightboxIndex);
}

function currentGalleryLightboxItems() {
  const visible = getVisibleImages(searchImages.value);
  return visible
    .map(img => ({
      id: img.id,
      src: img.imgBefore || img.imgAfter,
      srcAfter: img.imgBefore && img.imgAfter ? img.imgAfter : ''
    }))
    .filter(item => item.src);
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
async function incrementUsageCounter(meta) {
  if (!meta?.id) return;
  if (meta.type === 'gpt') {
    const item = gptLibrary.find(g => g.id === meta.id);
    if (!item) return;
    item.usageCount = (item.usageCount || 0) + 1;
    item.updated = Date.now();
    await chrome.storage.local.set({ gptLibrary });
    if (currentViewingGptId === meta.id) showDetailView(item);
    else renderLibrary(searchLibrary.value);
  }
  if (meta.type === 'image') {
    const item = imageLibrary.find(i => i.id === meta.id);
    if (!item) return;
    item.usageCount = (item.usageCount || 0) + 1;
    item.updated = Date.now();
    await chrome.storage.local.set({ imageLibrary });
    if (currentViewingImgId === meta.id) showImgDetail(item);
    else renderImageGallery(searchImages.value);
  }
}

function copyToClipboard(text, button, meta) {
  navigator.clipboard.writeText(text).then(async () => {
    await incrementUsageCounter(meta);
    if (!button) {
      showToast(t('toast.copied'));
      return;
    }
    const original = button.textContent;
    button.textContent = "OK";
    button.style.background = "#10a37f";
    setTimeout(() => { button.textContent = original; button.style.background = ""; }, 1000);
  });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 220);
  }, 2000);
}

function normalizeTag(tag) {
  return String(tag || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function allKnownTags() {
  const tags = new Map();
  [...gptLibrary, ...imageLibrary].filter(item => !item.deleted).forEach(item => {
    (item.tags || []).forEach(tag => {
      const key = normalizeTag(tag);
      if (key && !tags.has(key)) tags.set(key, tag);
    });
  });
  return Array.from(tags.values()).sort((a, b) => a.localeCompare(b, currentLang, { sensitivity: 'base' }));
}

function setupTagAutocomplete(input) {
  if (!input) return;
  const dropdown = document.createElement('div');
  dropdown.className = 'tag-autocomplete hidden';
  input.insertAdjacentElement('afterend', dropdown);

  const currentTerm = () => input.value.split(',').pop().trim();
  const selectedTags = () => new Set(parseTagsInput(input.value).map(normalizeTag));
  const close = () => dropdown.classList.add('hidden');
  const render = () => {
    const term = normalizeTag(currentTerm());
    const selected = selectedTags();
    const matches = allKnownTags()
      .filter(tag => !selected.has(normalizeTag(tag)))
      .filter(tag => !term || normalizeTag(tag).includes(term))
      .slice(0, 8);
    dropdown.innerHTML = '';
    if (!matches.length) return close();
    matches.forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = tag;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const parts = input.value.split(',');
        parts.pop();
        parts.push(` ${tag}`);
        input.value = parts.map(part => part.trim()).filter(Boolean).join(', ') + ', ';
        input.focus();
        close();
      });
      dropdown.appendChild(btn);
    });
    dropdown.classList.remove('hidden');
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(close, 120));
}

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
  const name = await customInput({
    title: t('modal.folder.title'),
    label: t('modal.folder.placeholder'),
    placeholder: t('modal.folder.placeholder'),
    confirmLabel: t('modal.folder.create')
  });
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
  const items = selectionMode === 'image' ? imageLibrary : gptLibrary;
  items.forEach(item => {
    if (!selectedIds.has(item.id)) return;
    const current = new Set(item.tags || []);
    if (mode === 'add') {
      tagsArr.forEach(t => current.add(t));
    } else if (mode === 'remove') {
      tagsArr.forEach(t => current.delete(t));
    } else if (mode === 'replace') {
      current.clear();
      tagsArr.forEach(t => current.add(t));
    }
    item.tags = Array.from(current);
    item.updated = Date.now();
  });
  if (selectionMode === 'image') await chrome.storage.local.set({ imageLibrary });
  else await chrome.storage.local.set({ gptLibrary });
  document.getElementById('bulkTagsModal').classList.add('hidden');
  if (selectionMode === 'image') renderImageGallery(searchImages.value);
  else renderLibrary(searchLibrary.value);
  clearSelection();
}

function setBulkBusy(isBusy, label = '') {
  [btnBulkMove, btnBulkModel, btnBulkAiClean, btnBulkAiTags, btnBulkAiNotes, btnBulkDelete, btnBulkCancel, document.getElementById('btnBulkTags'), document.getElementById('btnBulkExport')]
    .filter(Boolean)
    .forEach(btn => { btn.disabled = isBusy; });
  if (label) bulkCount.textContent = label;
}

function setProcessingItem(type, id, active) {
  const key = `${type}:${id}`;
  if (active) processingItems.add(key);
  else processingItems.delete(key);
  const selector = type === 'image' ? `.gallery-card[data-id="${CSS.escape(id)}"]` : `.gpt-card[data-id="${CSS.escape(id)}"]`;
  document.querySelector(selector)?.classList.toggle('processing', active);
}

async function bulkGenerateMissingNotes() {
  if (selectionMode !== 'text') return;
  const items = gptLibrary.filter(g => selectedIds.has(g.id) && !g.deleted && !g.note && g.prompt);
  if (!items.length) return alert(t('alerts.noMissingNotes'));
  setBulkBusy(true);
  let done = 0;
  try {
    for (const g of items) {
      bulkCount.textContent = t('bulk.progress', { done, total: items.length });
      setProcessingItem('text', g.id, true);
      const data = await callLocalAiJson(t('ai.noteSystem'), t('ai.notePrompt', { prompt: g.prompt.slice(0, 8000) }));
      const note = String(data.note || '').trim();
      if (note) {
        g.note = note;
        g.updated = Date.now();
        await chrome.storage.local.set({ gptLibrary });
        renderLibrary(searchLibrary.value);
      }
      setProcessingItem('text', g.id, false);
      done++;
    }
    bulkCount.textContent = t('bulk.progress', { done, total: items.length });
  } catch (err) {
    console.error(err);
    alert(t('alerts.localAiError') + '\n\n' + (err?.message || err));
  } finally {
    items.forEach(g => setProcessingItem('text', g.id, false));
    setBulkBusy(false);
    updateBulkBar();
  }
}

async function bulkCleanSelectedPrompts() {
  if (selectionMode !== 'text') return;
  const items = gptLibrary.filter(g => selectedIds.has(g.id) && !g.deleted && (g.prompt || (g.steps || []).some(step => !step.deleted && step.content)));
  if (!items.length) return alert(t('alerts.nothingSelected'));
  setBulkBusy(true);
  let done = 0;
  let cleanedTotal = 0;
  try {
    for (const g of items) {
      bulkCount.textContent = t('bulk.progress', { done, total: items.length });
      setProcessingItem('text', g.id, true);
      try {
        cleanedTotal += await cleanGptThread(g, { render: false });
        await chrome.storage.local.set({ gptLibrary });
        renderLibrary(searchLibrary.value);
      } catch (err) {
        console.warn('Nettoyage GPT ignoré', g.id, err);
      }
      setProcessingItem('text', g.id, false);
      done++;
    }
    bulkCount.textContent = t('bulk.progress', { done, total: items.length });
    showToast(t('toast.threadCleaned', { count: cleanedTotal }));
  } catch (err) {
    console.error(err);
    alert(t('alerts.localAiError') + '\n\n' + (err?.message || err));
  } finally {
    items.forEach(g => setProcessingItem('text', g.id, false));
    setBulkBusy(false);
    updateBulkBar();
  }
}

async function bulkAutoTagSelection() {
  const isImage = selectionMode === 'image';
  const items = (isImage ? imageLibrary : gptLibrary).filter(item => selectedIds.has(item.id) && !item.deleted && (!item.tags || item.tags.length === 0) && item.prompt);
  if (!items.length) return alert(t('alerts.noMissingTags'));
  setBulkBusy(true);
  let done = 0;
  try {
    for (const item of items) {
      bulkCount.textContent = t('bulk.progress', { done, total: items.length });
      setProcessingItem(isImage ? 'image' : 'text', item.id, true);
      const tags = isImage ? await generateTagsForImage(item, 3) : await generateTagsForGpt(item, 5);
      if (tags.length) {
        item.tags = tags;
        item.updated = Date.now();
        if (isImage) {
          await chrome.storage.local.set({ imageLibrary });
          renderImageGallery(searchImages.value);
        } else {
          await chrome.storage.local.set({ gptLibrary });
          renderLibrary(searchLibrary.value);
        }
      }
      setProcessingItem(isImage ? 'image' : 'text', item.id, false);
      done++;
    }
    bulkCount.textContent = t('bulk.progress', { done, total: items.length });
  } catch (err) {
    console.error(err);
    alert(t('alerts.localAiError') + '\n\n' + (err?.message || err));
  } finally {
    items.forEach(item => setProcessingItem(isImage ? 'image' : 'text', item.id, false));
    setBulkBusy(false);
    updateBulkBar();
  }
}

function selectImagesWithoutPrompt() {
  document.querySelector('[data-target="view-images"]').click();
  selectedIds.clear();
  imageLibrary
    .filter(img => !img.deleted && !String(img.prompt || '').trim())
    .forEach(img => selectedIds.add(img.id));
  selectionMode = selectedIds.size ? 'image' : null;
  renderImageGallery(searchImages.value);
  updateSelectionUI();
  if (!selectedIds.size) alert(t('alerts.noImagesWithoutPrompt'));
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
      const importedGpts = [];
      const importedImages = [];
      const shouldAutoNameImported = e.target.id === 'filePartialImportImg'
        ? !!autoNameImportStepsImg?.checked
        : !!autoNameImportSteps?.checked;

      // Fusion GPTs
      if (Array.isArray(data.gptLibrary)) {
        const existingIds = new Set(gptLibrary.map(g => g.id));
        data.gptLibrary.forEach(g => {
          if (existingIds.has(g.id)) {
            // Ré-attribuer un nouvel ID en cas de collision
            g.id = `g_${Date.now()}_${Math.floor(Math.random()*1000)}`;
          }
          gptLibrary.unshift(g);
          importedGpts.push(g);
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
          importedImages.push(i);
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
      if (shouldAutoNameImported) autoNameImportedSteps(importedGpts, importedImages);
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
  if (keyboardShortcutsReady) return;
  keyboardShortcutsReady = true;
  document.addEventListener('keydown', (e) => {
    // Détecter si on est dans un input/textarea (pour ne pas intercepter la frappe)
    const target = e.target;
    const isTyping = target.matches('input, textarea') ||
                     target.isContentEditable;

    if (!lightboxModal.classList.contains('hidden') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      navigateLightbox(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && target === inputText) {
      e.preventDefault();
      processSplit();
      return;
    }

    // Échap : ferme la modale ouverte, sinon désélectionne
    if (e.key === 'Escape') {
      closeContextMenu();
      if (finderState.open) {
        e.preventDefault();
        closeFinder();
        return;
      }
      const openModal = document.querySelector('.modal-overlay:not(.hidden)');
      if (openModal) {
        // Fermer la modale la plus récente
        openModal.classList.add('hidden');
        e.preventDefault();
        return;
      }
      const active = document.querySelector('.tab-content.active');
      if (active && active.id === 'view-library' && searchLibrary.value) {
        searchLibrary.value = '';
        renderLibrary('');
        e.preventDefault();
        return;
      }
      if (active && active.id === 'view-images' && searchImages.value) {
        searchImages.value = '';
        renderImageGallery('');
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

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    if (!isTyping && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      const id = getFocusedOrSingleSelectedTextId();
      const gpt = gptLibrary.find(g => g.id === id && !g.deleted);
      if (gpt) {
        e.preventDefault();
        copyToClipboard(gpt.prompt || '', null, { type: 'gpt', id });
        return;
      }
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

    // Ctrl+F : finder local in-page
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      const active = document.querySelector('.tab-content.active');
      if (!active) return;
      const inDetailGpt = !gptDetailView.classList.contains('hidden');
      const inDetailImg = !document.getElementById('imgDetailView').classList.contains('hidden');
      if (active.id === 'view-library' && !inDetailGpt) {
        e.preventDefault();
        openFinder('text');
      } else if (active.id === 'view-images' && !inDetailImg) {
        e.preventDefault();
        openFinder('image');
      }
      return;
    }

    if (!isTyping && finderState.open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault();
      navigateFinder(e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1);
      return;
    }

    if (!isTyping && !finderState.open && !currentViewingGptId && !currentViewingImgId) {
      const active = document.querySelector('.tab-content.active');
      if (active?.id === 'view-library' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        moveKeyboardGptFocus(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (active?.id === 'view-library' && e.key === 'Enter' && keyboardFocusedGptId) {
        const gpt = gptLibrary.find(g => g.id === keyboardFocusedGptId && !g.deleted);
        if (gpt) {
          e.preventDefault();
          showDetailView(gpt);
          return;
        }
      }
    }

    if (!isTyping && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedIds.size === 1) {
      e.preventDefault();
      const id = Array.from(selectedIds)[0];
      if (selectionMode === 'text') duplicateGPT(id);
      else if (selectionMode === 'image') duplicateImg(id);
      return;
    }

    if (!isTyping && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      const active = document.querySelector('.tab-content.active');
      if (active?.id === 'view-library' && !currentViewingGptId) {
        const id = getFocusedOrSingleSelectedTextId();
        const gpt = gptLibrary.find(g => g.id === id && !g.deleted);
        if (gpt) {
          e.preventDefault();
          openMainModal(gpt);
          return;
        }
      }
    }

    // Ctrl+N : nouveau prompt / image selon l'onglet
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      const active = document.querySelector('.tab-content.active');
      if (!active) return;
      if (active.id === 'view-library') {
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

    if (!isTyping && currentViewingGptId !== null) {
      const gpt = gptLibrary.find(g => g.id === currentViewingGptId && !g.deleted);
      if ((e.key.toLowerCase() === 'e') && gpt) {
        e.preventDefault();
        openMainModal(gpt);
        return;
      }
      if ((e.key.toLowerCase() === 'n' || e.key === '+') && gpt) {
        e.preventDefault();
        openStepModal();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        showListView();
        return;
      }
    }

    if (!isTyping && currentViewingImgId !== null) {
      const img = imageLibrary.find(i => i.id === currentViewingImgId && !i.deleted);
      if ((e.key.toLowerCase() === 'e') && img) {
        e.preventDefault();
        openImgModal(img);
        return;
      }
      if (e.key.toLowerCase() === 'n' && img) {
        e.preventDefault();
        openImgStepModal();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        showImgGallery();
        return;
      }
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
