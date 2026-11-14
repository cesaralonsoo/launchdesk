import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  publicDir: "../public",
  build: { outDir: "../dist/web", emptyOutDir: true, target: "es2022" },
  server: { port: 5173, proxy: { "/api": "http://localhost:8787", "/healthz": "http://localhost:8787" } },
});
