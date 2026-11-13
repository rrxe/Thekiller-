import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __CUSTOM_SFX__: JSON.stringify(process.env.VITE_CUSTOM_SFX ?? "") },
  // `npm run dev` runs the Vite dev server (5173) next to the API server (3000)
  server: { proxy: { "/api": "http://localhost:3000" } },
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
});
