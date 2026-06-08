<div align="center">

# 🎨 AI Master Studio

**A local-first desktop app to organize your AI prompts and your generated-image library.**
**✨[Sponsor this project](https://www.paypal.com/paypalme/NyxAwroo)**

![Version](https://img.shields.io/badge/version-3.6.0-10a37f?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-555?style=for-the-badge)

![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)

![Languages](https://img.shields.io/badge/languages-🇫🇷%20FR%20%7C%20🇬🇧%20EN-blueviolet)
![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen)

<img src="https://github.com/NyxAwroo/AI-Master-Studio/blob/main/screenshots/v1/text%20GPTs%20(2).png" alt="Aperçu AI Master Studio" width="45%"> <img src="https://github.com/NyxAwroo/AI-Master-Studio/blob/main/screenshots/v1/studio%20IMG%20(3).png" alt="Aperçu AI Master Studio" width="40%">

</div>

---

## ✨ What it does

AI Master Studio is a single place to keep everything you would otherwise scatter across notes, screenshots, and chat histories:

<img src="https://github.com/NyxAwroo/AI-Master-Studio/blob/main/screenshots/v1/splitter.png" alt="Aperçu AI Master Studio" width="35%"> <img src="https://github.com/NyxAwroo/AI-Master-Studio/blob/main/screenshots/v1/settings.png" alt="Aperçu AI Master Studio" width="35%">

- **Prompt Splitter** — chop long prompts into ChatGPT / Claude / Gemini-sized pieces with configurable token limits.
- **Text GPTs library** — folder organization, colored tags, multi-step prompts, list or grid view, advanced search (title, tags, prompt body, individual steps), bulk actions (move, tag, partial export, delete), partial import that merges without overwriting.
- **Studio Img** — visual gallery for AI-generated images with a 1 to 8-column contact-sheet zoom, lightbox with wheel-zoom and pan, side-by-side or **before/after slider** comparison for retouching steps, drag-and-drop anywhere on a modal, AI-model filtering.
- **Backup & Restore** — full or partial JSON export/import, compatible with previous versions.
- **Multilingual interface** — French and English shipped by default, more languages can be added by anyone with a single JSON file (see [Contributing translations](#-contributing-translations)).

<img src="https://github.com/NyxAwroo/AI-Master-Studio/blob/main/screenshots/v1/text%20GPTs%20(1).png" alt="Aperçu AI Master Studio" width="35%"> <img src="https://github.com/NyxAwroo/AI-Master-Studio/blob/main/screenshots/v1/studio%20IMG%20(1).png" alt="Aperçu AI Master Studio" width="35%"> 

All data lives in your user data folder (`%APPDATA%\com.nicol.ai-master-studio-v35\settings.bin` on Windows — the path is kept stable across versions so updates never lose your data) via the official `@tauri-apps/plugin-store`.

---

## 🚀 Quick start

### One-time prerequisites

If these are already installed, jump straight to *Install and run* below.

| Tool | Link | Notes |
|------|------|-------|
| Node.js (LTS) | https://nodejs.org/ | Standard installer, just keep clicking Next |
| Rust | https://rustup.rs/ | Choose option 1, then **restart your computer** |
| C++ Build Tools *(Windows only)* | https://visualstudio.microsoft.com/visual-cpp-build-tools/ | Check **"Desktop development with C++"** |

> **macOS:** install Xcode Command Line Tools with `xcode-select --install` instead of the C++ build tools.
> **Linux:** install `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev` via your package manager.

### Install and run

1. **Download** this repository (Code → Download ZIP) or clone it.
2. **Unzip** it anywhere you like.
3. **Double-click `1-Installer.bat`** *(once)* — installs the JavaScript dependencies.
4. **Double-click `2-Lancer.bat`** *(every time you want to launch the app)*.
5. **Wait 3 to 10 minutes the very first time** — Rust is compiling. Be patient, this only happens once.
6. The **"AI Master Studio"** window opens automatically.

> Mac/Linux users: open a terminal in the project folder and run `npm install`, then `npm run tauri dev`. Same effect, no `.bat` files needed.

### Restore a previous backup

If you are coming from an older version and have an `ai_master_backup_*.json` file:

1. In the app, click **⚙️** (top right).
2. **Choose file** → pick your JSON.
3. Click **📥 Restore**.
4. Confirm the warning.
5. A progress popup appears, then the app reloads with your data.

---

## 📦 Build a portable .exe ///// AVOID, because I coded to be used just with  "2-Lancer" (that's more easy for updates) //////

For a standalone executable that doesn't need a terminal:

**Double-click `3-Construire-exe.bat`** (5 to 15 minutes).

The portable .exe lands in `src-tauri\target\release\`, the .msi installer in `src-tauri\target\release\bundle\`.

For macOS and Linux, the equivalent command is `npm run tauri build` from a terminal — it produces a `.dmg`, `.app`, `.deb`, or `.AppImage` depending on your OS.

---

## 🌍 Contributing translations

The translation system is intentionally **dead simple**: one JSON file per language, dropped into `src/locales/`. Vite picks it up automatically — no JavaScript edit needed, no build step, just a pull request.

### Steps to add a new language

1. **Fork this repository** and clone your fork.
2. **Copy** `src/locales/en.json` to `src/locales/<your-code>.json`, where `<your-code>` is the ISO-639-1 code of your language (e.g. `de` for German, `es` for Spanish, `ja` for Japanese).
3. **Edit the `_meta` block** at the top:
   ```json
   "_meta": {
     "name": "Deutsch",
     "code": "de",
     "author": "Your GitHub username"
   }
   ```
4. **Translate every value** — keep the keys (the left side) untouched, only translate the string on the right.
5. **Launch the app** (`2-Lancer.bat` or `npm run tauri dev`) and check ⚙️ Settings → your new language is now in the dropdown.
6. **Open a Pull Request.** That's it.

### Translation guidelines

- Keep emojis when present — they are part of the visual identity of the app.
- `{count}`, `{gpt}`, `{img}`, `{folders}`, `{cats}` are placeholders. Don't translate or remove them, just place them where they read naturally in your language.
- The `_meta.name` field should be **the language name written in that language** (e.g. `Deutsch`, not `German`).
- If a key is missing from your file, the app silently falls back to English, so partial translations are fine — feel free to ship a draft.

---

## 📁 Project structure

```
ai-master-studio/
├── 1-Installer.bat          ← install JS deps (once)
├── 2-Lancer.bat             ← launch the app (daily)
├── 3-Construire-exe.bat     ← build the .exe (optional)
├── README.md                ← this file
├── GUIDE.md                 ← how to ask Claude (or any LLM) for an update
├── CHANGELOG.md             ← release notes
├── package.json             ← JS dependencies
├── vite.config.js           ← Vite config
├── src/                     ← FRONTEND
│   ├── index.html
│   ├── panel.css
│   ├── panel.js
│   └── locales/             ← 🌍 translations live here
│       ├── fr.json
│       └── en.json
└── src-tauri/               ← BACKEND (Rust) + Tauri config
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── src/
    │   ├── main.rs
    │   └── lib.rs
    ├── capabilities/
    │   └── default.json
    └── icons/
```

> The folder is named simply **`ai-master-studio`** (no version suffix) so future updates can be applied by overwriting the folder without losing your settings — your data lives in your user app-data directory, not inside the project folder.

---

## ❓ Troubleshooting

### `'tauri' is not recognized`
You ran `npm run tauri dev` before `npm install`. Run `1-Installer.bat` first.

### `Tauri API not detected after 5000 ms`
You opened `localhost:5173` in a browser. **Close the browser** and use only the native Tauri window that opened by itself.

### Rust compilation fails with `linker not found`
The C++ Build Tools are not installed. See the prerequisites table.

### My data doesn't show up after import
Make sure you are in the **"AI Master Studio"** window (check the Windows taskbar) and not in a web browser.

### Port 5173 is already in use
A previous instance didn't close cleanly. In PowerShell:
```
taskkill /F /IM node.exe
```
Then re-run `2-Lancer.bat`.

---

## 🆘 Modifying this project

See **GUIDE.md** — it explains step by step how to ask an AI assistant (Claude in particular) for a modification, with the right files to attach depending on the type of change.

---
### 💛 Support the project

AI Master Studio is a free, open project developed on personal time. If it helps your Instagram workflow, you can support its development with a donation.

**Donation link:** [PayPal](https://www.paypal.com/paypalme/NyxAwroo) 
// Donations help fund development time, testing, documentation and future improvements. Huge thanks to anyone who contributes 🙏

---

## 📜 License

MIT. Personal project, free to use and modify.

---

<div align="center">

Made with ❤️ by **NyxAwroo** · Powered by [Tauri](https://tauri.app) and a lot of coffee ☕

</div>
