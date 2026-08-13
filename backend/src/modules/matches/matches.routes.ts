import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { userIdOf } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { notFound, conflict } from "../../lib/errors";
import { CONNECTION_STATUS } from "../../config/constants";
import { isParticipant, otherUserId, publicProfile } from "../../lib/serializers";
import { getSettings } from "../../lib/settings";
import { creditEarned } from "../../lib/wallet";
import { trackFunnelOnce } from "../../lib/analytics";
import { notify } from "../../lib/notifications";

export const matchesRouter = Router();

matchesRouter.get("/", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    await expireInactive(userId);
    const rows = await prisma.connection.findMany({
      where: {
        OR: [{ userLowId: userId }, { userHighId: userId }],
        status: { notIn: [CONNECTION_STATUS.ARCHIVED] },
      },
      orderBy: [{ lastMessageAt: "desc" }, { matchedAt: "desc" }],
    });
    const payload = await Promise.all(rows.map((c) => serializeConnection(c.id, userId)));
    res.json({ matches: payload });
  } catch (err) {
    next(err);
  }
});

matchesRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const connection = await mustParticipate(req.params.id, userId);
    res.json(await serializeConnection(connection.id, userId));
  } catch (err) {
    next(err);
  }
});

matchesRouter.get("/:id/messages", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    await mustParticipate(req.params.id, userId);
    const take = Math.min(Number(req.query.limit ?? 50), 100);
    const messages = await prisma.message.findMany({
      where: { connectionId: req.params.id },
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json({ messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
});

matchesRouter.post(
  "/:id/messages",
  validate(z.object({ content: z.string().min(1).max(2000) })),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const connection = await mustParticipate(req.params.id, userId);
      if (
        [CONNECTION_STATUS.INACTIVE, CONNECTION_STATUS.ARCHIVED].includes(
          connection.status as typeof CONNECTION_STATUS.INACTIVE
        )
      ) {
        throw conflict("Este match está inactivo");
      }
      const message = await prisma.message.create({
        data: {
          connectionId: connection.id,
          senderId: userId,
          type: "TEXT",
          content: (req.body as { content: string }).content,
        },
      });
      const nextStatus =
        connection.status === CONNECTION_STATUS.MATCH ? CONNECTION_STATUS.TALKING : connection.status;
      await prisma.connection.update({
        where: { id: connection.id },
        data: { lastMessageAt: new Date(), status: nextStatus, inactiveAt: null },
      });
      await trackFunnelOnce(userId, "FIRST_MESSAGE");
      await maybeRewardConversation(connection.id);
      const other = otherUserId(connection, userId);
      await notify({
        userId: other,
        type: "MESSAGE",
        title: "Nuevo mensaje",
        body: "Tenés un mensaje nuevo",
        data: { connectionId: connection.id },
      });
      res.status(201).json(message);
    } catch (err) {
      next(err);
    }
  }
);

matchesRouter.post("/:id/read", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    await mustParticipate(req.params.id, userId);
    await prisma.message.updateMany({
      where: { connectionId: req.params.id, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

matchesRouter.post("/:id/reactivate", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const connection = await mustParticipate(req.params.id, userId);
    const credit = await prisma.userEffect.findFirst({
      where: { userId, key: "REACTIVATE_MATCH" },
    });
    if (!credit) throw conflict("Necesitás Reactivar match de la tienda");
    if (connection.status !== CONNECTION_STATUS.INACTIVE) {
      throw conflict("Este match no está inactivo");
    }
    await prisma.userEffect.delete({ where: { id: credit.id } });
    await prisma.connection.update({
      where: { id: connection.id },
      data: { status: CONNECTION_STATUS.MATCH, inactiveAt: null, archivedAt: null },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export async function mustParticipate(connectionId: string, userId: string) {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection || !isParticipant(connection, userId)) throw notFound("Match no encontrado");
  return connection;
}

export async function serializeConnection(connectionId: string, viewerId: string) {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection) throw notFound();
  const otherId = otherUserId(connection, viewerId);
  const other = await prisma.user.findUnique({
    where: { id: otherId },
    include: { profile: true, photos: true },
  });
  const last = await prisma.message.findFirst({
    where: { connectionId },
    orderBy: { createdAt: "desc" },
  });
  const unread = await prisma.message.count({
    where: { connectionId, senderId: { not: viewerId }, readAt: null },
  });
  const activeProposal = await prisma.dateProposal.findFirst({
    where: { connectionId, status: { in: ["PENDING", "ACCEPTED"] } },
    orderBy: { createdAt: "desc" },
  });
  const viewer = await prisma.profile.findUnique({ where: { userId: viewerId } });
  return {
    id: connection.id,
    status: connection.status,
    matchedAt: connection.matchedAt,
    lastMessageAt: connection.lastMessageAt,
    unread,
    lastMessage: last,
    proposal: activeProposal,
    other: other
      ? publicProfile(other, { latitude: viewer?.latitude, longitude: viewer?.longitude })
      : null,
  };
}

export async function expireInactive(userId?: string) {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.matchInactiveHours * 60 * 60 * 1000);
  await prisma.connection.updateMany({
    where: {
      status: CONNECTION_STATUS.MATCH,
      lastMessageAt: null,
      matchedAt: { lt: cutoff },
      ...(userId ? { OR: [{ userLowId: userId }, { userHighId: userId }] } : {}),
    },
    data: { status: CONNECTION_STATUS.INACTIVE, inactiveAt: new Date() },
  });
}

async function maybeRewardConversation(connectionId: string) {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.conversationRewardedAt) return;
  const settings = await getSettings();
  const min = settings.meaningfulConversationMinMessagesEach;
  const fromLow = await prisma.message.count({
    where: { connectionId, senderId: connection.userLowId, type: "TEXT" },
  });
  const fromHigh = await prisma.message.count({
    where: { connectionId, senderId: connection.userHighId, type: "TEXT" },
  });
  if (fromLow < min || fromHigh < min) return;
  await prisma.connection.update({
    where: { id: connectionId },
    data: { conversationRewardedAt: new Date() },
  });
  await creditEarned({
    userId: connection.userLowId,
    amount: settings.rewards.MEANINGFUL_CONVERSATION,
    reason: "MEANINGFUL_CONVERSATION",
    referenceType: "CONNECTION",
    referenceId: connectionId,
  });
  await creditEarned({
    userId: connection.userHighId,
    amount: settings.rewards.MEANINGFUL_CONVERSATION,
    reason: "MEANINGFUL_CONVERSATION",
    referenceType: "CONNECTION",
    referenceId: connectionId,
  });
}
