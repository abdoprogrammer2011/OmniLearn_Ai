import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import roomDocumentsHandler from "./api/rooms/documents.js";

function roomDocumentsDevApi() {
  return {
    name: "omnilearn-room-documents-dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/rooms/documents", (req, res, next) => {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed." }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on("end", () => {
          let body: unknown;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "A valid JSON request body is required." }));
            return;
          }
          const adapter = {
            setHeader: res.setHeader.bind(res),
            status(statusCode: number) {
              res.statusCode = statusCode;
              return adapter;
            },
            json(responseBody: unknown) {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify(responseBody));
              return adapter;
            },
          };
          void roomDocumentsHandler({ method: req.method, headers: req.headers, body }, adapter).catch(next);
        });
        req.on("error", next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === "development") {
    const env = loadEnv(mode, process.cwd(), "");
    for (const name of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "FIREBASE_PROJECT_ID"]) {
      if (!process.env[name] && env[name]) process.env[name] = env[name];
    }
    if (!process.env.FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID) {
      process.env.FIREBASE_PROJECT_ID = env.VITE_FIREBASE_PROJECT_ID;
    }
  }
  return {
    plugins: [react(), roomDocumentsDevApi()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" },
    },
  };
});
