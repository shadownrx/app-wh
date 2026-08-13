import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { userIdOf } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { CONNECTION_STATUS } from "../../config/constants";

export const moderationRouter = Router();

moderationRouter.get("/blocks", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const blocks = await prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ blocks });
  } catch (err) {
    next(err);
  }
});

moderationRouter.post("/users/:id/block", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const blockedId = req.params.id;
    if (blockedId === userId) throw badRequest("No podés bloquearte a vos");
    const target = await prisma.user.findUnique({ where: { id: blockedId } });
    if (!target) throw notFound();
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId } },
      update: {},
      create: { blockerId: userId, blockedId },
    });
    await prisma.reputation.update({
      where: { userId: blockedId },
      data: { blocksReceived: { increment: 1 } },
    });
    await prisma.connection.updateMany({
      where: {
        OR: [
          { userLowId: userId, userHighId: blockedId },
          { userLowId: blockedId, userHighId: userId },
        ],
      },
      data: { status: CONNECTION_STATUS.ARCHIVED, archivedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

moderationRouter.delete("/users/:id/block", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    await prisma.block.deleteMany({
      where: { blockerId: userId, blockedId: req.params.id },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

moderationRouter.post(
  "/users/:id/report",
  validate(
    z.object({
      reason: z.enum([
        "FAKE_PROFILE",
        "INAPPROPRIATE",
        "HARASSMENT",
        "UNSOLICITED_SEXUAL",
        "POSSIBLE_MINOR",
        "SPAM_SCAM",
        "OTHER",
      ]),
      details: z.string().max(1000).optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const reportedId = req.params.id;
      if (reportedId === userId) throw conflict("No podés reportarte a vos");
      const target = await prisma.user.findUnique({ where: { id: reportedId } });
      if (!target) throw notFound();
      const report = await prisma.report.create({
        data: {
          reporterId: userId,
          reportedId,
          reason: req.body.reason,
          details: req.body.details,
        },
      });
      await prisma.reputation.update({
        where: { userId: reportedId },
        data: { reportsReceived: { increment: 1 } },
      });
      if (req.body.reason === "POSSIBLE_MINOR") {
        await prisma.user.update({
          where: { id: reportedId },
          data: { status: "SUSPENDED" },
        });
      }
      res.status(201).json({ reportId: report.id, status: report.status });
    } catch (err) {
      next(err);
    }
  }
);
