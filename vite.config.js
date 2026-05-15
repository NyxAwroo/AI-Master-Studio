import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  // Le frontend est dans /src
  root: "src",

  // Le build va dans /dist à la racine du projet
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },

  // Empêche Vite d'écouter sur localhost pour les WebSockets
  // (sinon ça déclenche le bug HMR à travers Tauri)
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      port: 5173,
    },
  },
});
