import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

// "/" is the v7 app (web/index.html → proto/main.ts). The v4 bundle (web/classic.html → src/main.ts) still owns the
// public generated site /s/:slug and the shared pack /r/:shareId. /proto.html stays as an alias of the v7 app.
// VITE_API points the dev proxy at another API port (default 8790).
const api = process.env.VITE_API || "http://localhost:8790";
const CLASSIC = /^\/(s|r)\/[^/?#]+\/?(?:[?#].*)?$/;

const classicRoutes = (): Plugin => ({
  name: "launchdesk-classic-routes",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && CLASSIC.test(req.url)) req.url = "/classic.html";
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && CLASSIC.test(req.url)) req.url = "/classic.html";
      next();
    });
  },
});

export default defineConfig({
  root: "web",
  publicDir: "../public",
  plugins: [classicRoutes()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "web/index.html"),
        classic: resolve(import.meta.dirname, "web/classic.html"),
        proto: resolve(import.meta.dirname, "web/proto.html"),
      },
    },
  },
  server: { port: 5173, proxy: { "/api": api, "/healthz": api } },
});
