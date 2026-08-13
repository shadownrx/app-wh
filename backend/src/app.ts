import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { getSettings } from "./lib/settings";
import { registerApi } from "./http/routes";

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(path.resolve(process.cwd(), env.uploadDir)));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: env.appName, env: env.nodeEnv });
  });

  app.get("/api/meta", async (_req, res, next) => {
    try {
      const settings = await getSettings();
      res.json({
        appName: env.appName,
        proposalLabel: settings.proposalLabel,
        currencyName: settings.currencyName,
        dailyProfileLimit: settings.dailyProfileLimit,
        maxPhotos: env.maxPhotos,
      });
    } catch (err) {
      next(err);
    }
  });

  registerApi(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
