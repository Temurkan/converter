import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  server: {
    // ВАЖНО: убедитесь, что порты не конфликтуют
    port: 5173,
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
    // Добавляем строгий MIME-тип для WASM (иногда помогает в Windows/OneDrive)
    fs: {
      allow: [".."],
    },
  },
});
