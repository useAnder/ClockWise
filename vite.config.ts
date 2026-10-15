import { defineConfig } from "vite";
import { resolve } from "node:path";

// Two pages: the clock widget (index.html) and the settings panel (settings.html).
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        clock: resolve(import.meta.dirname, "index.html"),
        settings: resolve(import.meta.dirname, "settings.html"),
      },
    },
  },
});
