import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { userIdOf } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { notFound } from "../../lib/errors";
import { getSettings, saveSettings } from "../../lib/settings";
import { adminAdjust } from "../../lib/wallet";
import { DEFAULT_SETTINGS } from "../../config/constants";
import {
  reportUpdateSchema,
  userStatusSchema,
  verifyUserSchema,
  walletAdjustSchema,
} from "./schema";

export const adminRouter = Router();

adminRouter.get("/users", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const take = Math.min(Number(req.query.limit ?? 30), 100);
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q } },
              { phone: { contains: q } },
              { profile: { displayName: { contains: q } } },
            ],
          }
        : undefined,
      include: { profile: true, wallet: true, reputation: true },
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.profile?.displayName,
        status: u.status,
        verified: Boolean(u.profile?.verifiedAt || u.emailVerifiedAt),
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt,
        balance: (u.wallet?.earnedBalance ?? 0) + (u.wallet?.purchasedBalance ?? 0),
        reputation: u.reputation,
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/users/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { profile: true, photos: true, wallet: true, reputation: true },
    });
    if (!user) throw notFound();
    const tx = await prisma.walletTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    res.json({ user, transactions: tx });
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  "/users/:id/status",
  validate(userStatusSchema),
  async (req, res, next) => {
    try {
      const adminId = userIdOf(req);
      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!user) throw notFound();
      await prisma.user.update({ where: { id: user.id }, data: { status: req.body.status } });
      await prisma.auditLog.create({
        data: {
          adminId,
          action: `USER_${req.body.status}`,
          targetType: "USER",
          targetId: user.id,
          details: JSON.stringify({ reason: req.body.reason }),
        },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.post(
  "/users/:id/verify",
  validate(verifyUserSchema),
  async (req, res, next) => {
    try {
      const adminId = userIdOf(req);
      await prisma.profile.update({
        where: { userId: req.params.id },
        data: { verifiedAt: new Date(), verificationMethod: req.body.method },
      });
      await prisma.auditLog.create({
        data: {
          adminId,
          action: "USER_VERIFY",
          targetType: "USER",
          targetId: req.params.id,
          details: JSON.stringify({ method: req.body.method }),
        },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.post(
  "/users/:id/wallet",
  validate(walletAdjustSchema),
  async (req, res, next) => {
    try {
      const adminId = userIdOf(req);
      await adminAdjust({
        userId: req.params.id,
        amount: req.body.amount,
        reason: req.body.reason,
        adminId,
      });
      await prisma.auditLog.create({
        data: {
          adminId,
          action: "WALLET_ADJUST",
          targetType: "USER",
          targetId: req.params.id,
          details: JSON.stringify(req.body),
        },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.get("/reports", async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const reports = await prisma.report.findMany({
      where: status ? { status } : undefined,
      include: {
        reporter: { include: { profile: true } },
        reported: { include: { profile: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({
      reports: reports.map((r) => ({
        id: r.id,
        reason: r.reason,
        details: r.details,
        status: r.status,
        resolution: r.resolution,
        createdAt: r.createdAt,
        reporter: { id: r.reporterId, name: r.reporter.profile?.displayName, email: r.reporter.email },
        reported: { id: r.reportedId, name: r.reported.profile?.displayName, email: r.reported.email },
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch(
  "/reports/:id",
  validate(reportUpdateSchema),
  async (req, res, next) => {
    try {
      const adminId = userIdOf(req);
      const report = await prisma.report.update({
        where: { id: req.params.id },
        data: {
          status: req.body.status,
          resolution: req.body.resolution,
          resolvedAt: ["RESOLVED", "DISMISSED"].includes(req.body.status) ? new Date() : null,
          resolvedBy: adminId,
        },
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.get("/config", async (_req, res, next) => {
  try {
    res.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/config", async (req, res, next) => {
  try {
    const adminId = userIdOf(req);
    const settings = await saveSettings(req.body ?? {});
    await prisma.auditLog.create({
      data: {
        adminId,
        action: "CONFIG_UPDATE",
        targetType: "SETTINGS",
        details: JSON.stringify(req.body ?? {}),
      },
    });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/analytics", async (_req, res, next) => {
  try {
    const [registered, matches, conversations, proposals, accepted, verified, earned, spent] =
      await Promise.all([
        prisma.user.count({ where: { status: { not: "DELETED" } } }),
        prisma.connection.count(),
        prisma.connection.count({ where: { lastMessageAt: { not: null } } }),
        prisma.dateProposal.count(),
        prisma.dateProposal.count({ where: { status: "ACCEPTED" } }),
        prisma.dateVerification.count({ where: { verifiedAt: { not: null } } }),
        prisma.walletTransaction.aggregate({
          where: { direction: "CREDIT" },
          _sum: { amount: true },
        }),
        prisma.walletTransaction.aggregate({
          where: { direction: "DEBIT" },
          _sum: { amount: true },
        }),
      ]);
    const activeSince = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const activeUsers = await prisma.user.count({
      where: { lastActiveAt: { gte: activeSince }, status: "ACTIVE" },
    });
    const matchToDateRate = matches === 0 ? 0 : Number(((verified / matches) * 100).toFixed(2));
    const funnelNames = [
      "REGISTERED",
      "PROFILE_COMPLETED",
      "FIRST_INTEREST",
      "FIRST_MATCH",
      "FIRST_MESSAGE",
      "FIRST_PROPOSAL",
      "FIRST_DATE_ACCEPTED",
      "FIRST_DATE_VERIFIED",
    ];
    const funnel = [];
    for (const name of funnelNames) {
      funnel.push({ name, count: await prisma.analyticsEvent.count({ where: { name } }) });
    }
    res.json({
      usersRegistered: registered,
      usersActive7d: activeUsers,
      matches,
      conversations,
      dateProposals: proposals,
      datesAccepted: accepted,
      datesVerified: verified,
      matchToDateRate,
      coinsEarned: earned._sum.amount ?? 0,
      coinsSpent: spent._sum.amount ?? 0,
      funnel,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/suspicious", async (_req, res, next) => {
  try {
    const items = await prisma.suspiciousActivity.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});
