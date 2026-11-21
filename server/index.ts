import dotenv from "dotenv";
dotenv.config();

import client from "prom-client";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic, log } from "./vite.js";
import { initializeDatabase } from "./db.js";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.get("/metrics", async (_req: Request, res: Response) => {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error("Error generating metrics:", error);
    res.status(500).end("Error generating metrics");
  }
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

let initPromise: Promise<void> | null = null;

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      await initializeDatabase();

      const server = await registerRoutes(app);

      app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";

        console.error("Unhandled route error:", err);

        if (!res.headersSent) {
          res.status(status).json({ message });
        }
      });

      app.use("/api", (req: Request, res: Response) => {
        res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl}` });
      });

      if (!process.env.VERCEL) {
        if (process.env.NODE_ENV === "development" || app.get("env") === "development") {
          await setupVite(app, server);
        } else {
          serveStatic(app);
        }

        const port = Number(process.env.PORT) || 5000;
        const host = process.env.HOST || "127.0.0.1";
        server.listen(port, host, () => {
          log(`serving on http://${host}:${port}`);
        });
      }
    })();
  }

  return initPromise;
}

if (!process.env.VERCEL) {
  void ensureInitialized();
}

export default async function handler(req: Request, res: Response) {
  await ensureInitialized();
  return app(req, res);
}