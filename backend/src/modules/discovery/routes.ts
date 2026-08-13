import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { userIdOf } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { getSettings } from "../../lib/settings";
import { utcDay, ageFromDob } from "../../lib/age";
import { haversineMeters } from "../../lib/geo";
import { parseJsonArray, pairIds, publicProfile } from "../../lib/serializers";
import { CONNECTION_STATUS, SWIPE } from "../../config/constants";
import { creditEarned } from "../../lib/wallet";
import { trackFunnelOnce } from "../../lib/analytics";
import { notify } from "../../lib/notifications";
import { isBlocked, blockedIdsFor } from "../../lib/blocks";
import { getOrCreateQuota, remainingProfiles } from "../../lib/quota";
import { swipeSchema } from "./schema";

export const discoverRouter = Router();

discoverRouter.get("/", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const limit = Math.min(Number(req.query.limit ?? 10), 20);
    const settings = await getSettings();
    const me = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, photos: true },
    });
    if (!me?.profile) throw badRequest("Completá tu perfil para descubrir personas");

    const quota = await getOrCreateQuota(userId);
    const remaining = remainingProfiles(quota, settings.dailyProfileLimit);
    if (remaining <= 0) {
      res.json({
        profiles: [],
        remaining: 0,
        dailyLimit: settings.dailyProfileLimit + quota.extraProfiles,
        limitReached: true,
      });
      return;
    }

    const blockedIds = await blockedIdsFor(userId);
    const swiped = await prisma.swipe.findMany({
      where: { fromUserId: userId },
      select: { toUserId: true },
    });
    const exclude = new Set<string>([userId, ...blockedIds, ...swiped.map((s) => s.toUserId)]);

    const boosted = await prisma.userEffect.findMany({
      where: { key: "BOOST", expiresAt: { gt: new Date() } },
      select: { userId: true },
    });
    const boostedIds = new Set(boosted.map((b) => b.userId));

    const candidates = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        id: { notIn: [...exclude] },
        profile: { isNot: null },
      },
      include: { profile: true, photos: true },
      take: 80,
    });

    const myInterests = parseJsonArray(me.profile.interestedIn);
    const scored = candidates
      .filter((c) => {
        if (!c.profile) return false;
        const age = ageFromDob(c.dateOfBirth);
        if (age < me.profile!.ageMin || age > me.profile!.ageMax) return false;
        if (myInterests.length && !myInterests.includes(c.profile.gender)) return false;
        const theirInterests = parseJsonArray(c.profile.interestedIn);
        if (theirInterests.length && !theirInterests.includes(me.profile!.gender)) return false;
        if (me.profile!.latitude != null && me.profile!.longitude != null && c.profile.latitude != null && c.profile.longitude != null) {
          const meters = haversineMeters(
            me.profile!.latitude,
            me.profile!.longitude,
            c.profile.latitude,
            c.profile.longitude
          );
          if (meters / 1000 > me.profile!.maxDistanceKm) return false;
        }
        return true;
      })
      .map((c) => {
        const myTags = new Set(parseJsonArray(me.profile!.interests));
        const theirTags = parseJsonArray(c.profile!.interests);
        const shared = theirTags.filter((t) => myTags.has(t)).length;
        const boost = boostedIds.has(c.id) ? 100 : 0;
        const recency = Math.max(0, 10 - (Date.now() - c.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24));
        return { user: c, score: boost + shared * 3 + recency };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(limit, remaining));

    await prisma.dailyQuota.update({
      where: { id: quota.id },
      data: { profilesUsed: { increment: scored.length } },
    });

    res.json({
      profiles: scored.map((s) =>
        publicProfile(s.user, { latitude: me.profile!.latitude, longitude: me.profile!.longitude }, {
          boosted: boostedIds.has(s.user.id),
        })
      ),
      remaining: remaining - scored.length,
      dailyLimit: settings.dailyProfileLimit + quota.extraProfiles,
      limitReached: false,
    });
  } catch (err) {
    next(err);
  }
});

discoverRouter.get("/person-of-the-day", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const day = utcDay();
    const existing = await prisma.personOfTheDay.findUnique({
      where: { viewerId_day: { viewerId: userId, day } },
    });
    let featuredId = existing?.featuredUserId;
    if (!featuredId) {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });
      if (!me?.profile) throw badRequest("Completá tu perfil");
      const blockedIds = await blockedIdsFor(userId);
      const candidates = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          id: { notIn: [userId, ...blockedIds] },
          profile: { isNot: null },
        },
        include: { profile: true, photos: true },
        take: 50,
        orderBy: { lastActiveAt: "desc" },
      });
      const myInterests = parseJsonArray(me.profile.interestedIn);
      const pick = candidates.find((c) => {
        if (!c.profile) return false;
        const age = ageFromDob(c.dateOfBirth);
        if (age < me.profile!.ageMin || age > me.profile!.ageMax) return false;
        if (myInterests.length && !myInterests.includes(c.profile.gender)) return false;
        return true;
      });
      if (!pick) {
        res.json({ person: null });
        return;
      }
      featuredId = pick.id;
      await prisma.personOfTheDay.create({
        data: { viewerId: userId, day, featuredUserId: featuredId },
      });
    }
    const featured = await prisma.user.findUnique({
      where: { id: featuredId },
      include: { profile: true, photos: true },
    });
    const viewer = await prisma.profile.findUnique({ where: { userId } });
    res.json({
      person: featured
        ? publicProfile(featured, { latitude: viewer?.latitude, longitude: viewer?.longitude }, {
            personOfTheDay: true,
          })
        : null,
    });
  } catch (err) {
    next(err);
  }
});

discoverRouter.post(
  "/swipe",
  validate(swipeSchema),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const { targetId, action } = req.body as { targetId: string; action: string };
      if (targetId === userId) throw badRequest("No podés swipearte a vos");
      if (await isBlocked(userId, targetId)) throw notFound();
      const target = await prisma.user.findUnique({ where: { id: targetId } });
      if (!target || target.status !== "ACTIVE") throw notFound();

      if (action === SWIPE.SUPER_INVITE) {
        const effect = await prisma.userEffect.findFirst({
          where: { userId, key: "SUPER_INVITE_CREDIT" },
          orderBy: { createdAt: "desc" },
        });
        if (!effect) throw conflict("Necesitás una Super invitación de la tienda");
        await prisma.userEffect.delete({ where: { id: effect.id } });
      }

      const existing = await prisma.swipe.findUnique({
        where: { fromUserId_toUserId: { fromUserId: userId, toUserId: targetId } },
      });
      if (existing) throw conflict("Ya interactuaste con este perfil");

      await prisma.swipe.create({ data: { fromUserId: userId, toUserId: targetId, action } });
      if (action === SWIPE.PASS) {
        await prisma.lastPass.upsert({
          where: { userId },
          update: { targetId, swipedAt: new Date(), restoredAt: null },
          create: { userId, targetId },
        });
      }

      await trackFunnelOnce(userId, "FIRST_INTEREST");

      let match = null;
      if (action === SWIPE.LIKE || action === SWIPE.SUPER_INVITE) {
        const reciprocal = await prisma.swipe.findFirst({
          where: {
            fromUserId: targetId,
            toUserId: userId,
            action: { in: [SWIPE.LIKE, SWIPE.SUPER_INVITE] },
          },
        });
        if (reciprocal) {
          match = await createMatch(userId, targetId, action === SWIPE.SUPER_INVITE ? userId : null);
        }
      }

      res.json({ ok: true, match });
    } catch (err) {
      next(err);
    }
  }
);

discoverRouter.get("/likes", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const effect = await prisma.userEffect.findFirst({
      where: {
        userId,
        key: "SEE_LIKES",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!effect) {
      res.status(402).json({
        error: "SHOP_REQUIRED",
        message: "Desbloqueá Ver likes desde la tienda",
      });
      return;
    }
    const likes = await prisma.swipe.findMany({
      where: {
        toUserId: userId,
        action: { in: [SWIPE.LIKE, SWIPE.SUPER_INVITE] },
      },
      include: { fromUser: { include: { profile: true, photos: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const already = await prisma.swipe.findMany({
      where: { fromUserId: userId },
      select: { toUserId: true },
    });
    const swiped = new Set(already.map((s) => s.toUserId));
    const viewer = await prisma.profile.findUnique({ where: { userId } });
    res.json({
      likes: likes
        .filter((l) => !swiped.has(l.fromUserId))
        .map((l) =>
          publicProfile(l.fromUser, { latitude: viewer?.latitude, longitude: viewer?.longitude }, {
            superInvite: l.action === SWIPE.SUPER_INVITE,
          })
        ),
    });
  } catch (err) {
    next(err);
  }
});

export async function createMatch(a: string, b: string, superInviteFromId: string | null) {
  const [low, high] = pairIds(a, b);
  const existing = await prisma.connection.findUnique({
    where: { userLowId_userHighId: { userLowId: low, userHighId: high } },
  });
  if (existing && existing.status !== CONNECTION_STATUS.ARCHIVED) return existing;

  const settings = await getSettings();
  const connection = existing
    ? await prisma.connection.update({
        where: { id: existing.id },
        data: {
          status: CONNECTION_STATUS.MATCH,
          matchedAt: new Date(),
          inactiveAt: null,
          archivedAt: null,
          superInviteFromId,
        },
      })
    : await prisma.connection.create({
        data: {
          userLowId: low,
          userHighId: high,
          status: CONNECTION_STATUS.MATCH,
          superInviteFromId,
        },
      });

  await creditEarned({
    userId: a,
    amount: settings.rewards.MATCH,
    reason: "MATCH",
    referenceType: "CONNECTION",
    referenceId: connection.id,
  });
  await creditEarned({
    userId: b,
    amount: settings.rewards.MATCH,
    reason: "MATCH",
    referenceType: "CONNECTION",
    referenceId: connection.id,
  });
  await trackFunnelOnce(a, "FIRST_MATCH");
  await trackFunnelOnce(b, "FIRST_MATCH");
  await notify({
    userId: a,
    type: "MATCH",
    title: "¡Match!",
    body: "El match no es el premio. Es el comienzo.",
    data: { connectionId: connection.id },
  });
  await notify({
    userId: b,
    type: "MATCH",
    title: "¡Match!",
    body: "El match no es el premio. Es el comienzo.",
    data: { connectionId: connection.id },
  });
  return connection;
}
