import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: __dirname,
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: { outDir: "dist", emptyOutDir: true, target: "es2022", cssCodeSplit: false, assetsInlineLimit: 100000000 },
  server: { proxy: { "/api": "http://127.0.0.1:4848", "/hooks": "http://127.0.0.1:4848" } },
});
