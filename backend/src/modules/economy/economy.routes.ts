import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { userIdOf } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { conflict, notFound } from "../../lib/errors";
import { getSettings } from "../../lib/settings";
import { debit, ensureWallet } from "../../lib/wallet";
import { SHOP_KEYS } from "../../config/constants";
import { getOrCreateQuota } from "../discovery/discovery.routes";
import { utcDay } from "../../lib/age";

export const walletRouter = Router();
export const shopRouter = Router();

walletRouter.get("/", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const wallet = await ensureWallet(userId);
    res.json({
      balance: wallet.earnedBalance + wallet.purchasedBalance,
      earnedBalance: wallet.earnedBalance,
      purchasedBalance: wallet.purchasedBalance,
    });
  } catch (err) {
    next(err);
  }
});

walletRouter.get("/history", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const take = Math.min(Number(req.query.limit ?? 50), 100);
    const items = await prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

shopRouter.get("/", async (_req, res, next) => {
  try {
    const settings = await getSettings();
    const items = await prisma.shopItem.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } });
    res.json({
      currencyName: settings.currencyName,
      items: items.map((i) => ({ ...i, price: settings.shopPrices[i.key as keyof typeof settings.shopPrices] ?? i.price })),
    });
  } catch (err) {
    next(err);
  }
});

shopRouter.post(
  "/purchase",
  validate(z.object({ key: z.string(), targetId: z.string().optional() })),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const { key, targetId } = req.body as { key: string; targetId?: string };
      const item = await prisma.shopItem.findUnique({ where: { key } });
      if (!item || !item.enabled) throw notFound("Recompensa no disponible");
      const settings = await getSettings();
      const price = settings.shopPrices[key as keyof typeof settings.shopPrices] ?? item.price;
      await debit({
        userId,
        amount: price,
        reason: `SHOP_${key}`,
        referenceType: "SHOP",
        referenceId: key,
      });
      const result = await applyShopItem(userId, key, targetId);
      res.json({ ok: true, key, spent: price, result });
    } catch (err) {
      next(err);
    }
  }
);

async function applyShopItem(userId: string, key: string, targetId?: string) {
  const settings = await getSettings();
  const now = Date.now();
  switch (key) {
    case SHOP_KEYS.UNDO_PASS: {
      const last = await prisma.lastPass.findUnique({ where: { userId } });
      if (!last || last.restoredAt) throw conflict("No hay un pass reciente para deshacer");
      await prisma.swipe.deleteMany({
        where: { fromUserId: userId, toUserId: last.targetId, action: "PASS" },
      });
      await prisma.lastPass.update({ where: { userId }, data: { restoredAt: new Date() } });
      return { restoredUserId: last.targetId };
    }
    case SHOP_KEYS.EXTRA_PROFILES: {
      const quota = await getOrCreateQuota(userId);
      await prisma.dailyQuota.update({
        where: { id: quota.id },
        data: { extraProfiles: { increment: settings.extraProfilesPerPurchase } },
      });
      return { extraProfiles: settings.extraProfilesPerPurchase, day: utcDay() };
    }
    case SHOP_KEYS.SUPER_INVITE: {
      await prisma.userEffect.create({ data: { userId, key: "SUPER_INVITE_CREDIT" } });
      return { credits: 1 };
    }
    case SHOP_KEYS.BOOST: {
      const expiresAt = new Date(now + settings.boostHours * 3600 * 1000);
      await prisma.userEffect.create({ data: { userId, key: "BOOST", expiresAt } });
      return { expiresAt };
    }
    case SHOP_KEYS.SEE_LIKES: {
      const expiresAt = new Date(now + settings.seeLikesHours * 3600 * 1000);
      await prisma.userEffect.create({ data: { userId, key: "SEE_LIKES", expiresAt } });
      return { expiresAt };
    }
    case SHOP_KEYS.PREMIUM_FILTERS:
    case SHOP_KEYS.PREMIUM_24H: {
      const expiresAt = new Date(now + settings.premiumHours * 3600 * 1000);
      await prisma.userEffect.create({ data: { userId, key, expiresAt } });
      return { expiresAt };
    }
    case SHOP_KEYS.REACTIVATE_MATCH: {
      if (!targetId) {
        await prisma.userEffect.create({ data: { userId, key: "REACTIVATE_MATCH" } });
        return { creditStored: true };
      }
      const connection = await prisma.connection.findUnique({ where: { id: targetId } });
      if (!connection || (connection.userLowId !== userId && connection.userHighId !== userId)) {
        throw notFound("Match no encontrado");
      }
      if (connection.status !== "INACTIVE") throw conflict("Este match no está inactivo");
      await prisma.connection.update({
        where: { id: connection.id },
        data: { status: "MATCH", inactiveAt: null },
      });
      return { reactivated: connection.id };
    }
    default:
      throw notFound("Recompensa no implementada");
  }
}
