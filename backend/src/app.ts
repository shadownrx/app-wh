import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { meRouter, usersRouter } from "./modules/users/users.routes";
import { discoverRouter } from "./modules/discovery/discovery.routes";
import { matchesRouter } from "./modules/matches/matches.routes";
import { datesRouter } from "./modules/dates/dates.routes";
import { walletRouter, shopRouter } from "./modules/economy/economy.routes";
import { moderationRouter } from "./modules/moderation/moderation.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { requireAuth, requireAdmin } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { getSettings } from "./lib/settings";

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

  app.use("/api/auth", authRouter);
  app.use("/api/me", requireAuth, meRouter);
  app.use("/api/users", requireAuth, usersRouter);
  app.use("/api/discover", requireAuth, discoverRouter);
  app.use("/api/matches", requireAuth, matchesRouter);
  app.use("/api", requireAuth, datesRouter);
  app.use("/api/wallet", requireAuth, walletRouter);
  app.use("/api/shop", requireAuth, shopRouter);
  app.use("/api", requireAuth, moderationRouter);
  app.use("/api/admin", requireAuth, requireAdmin, adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
