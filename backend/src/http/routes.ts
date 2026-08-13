import { Express } from "express";
import { authRouter } from "../modules/auth/routes";
import { meRouter, usersRouter } from "../modules/profiles/routes";
import { discoverRouter } from "../modules/discovery/routes";
import { matchesRouter } from "../modules/matches/routes";
import { datesRouter } from "../modules/dates/routes";
import { walletRouter, shopRouter } from "../modules/economy/routes";
import { moderationRouter } from "../modules/moderation/routes";
import { adminRouter } from "../modules/admin/routes";
import { requireAuth, requireAdmin } from "../middleware/auth";

export function registerApi(app: Express) {
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
}
