import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { userIdOf } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { badRequest, notFound } from "../../lib/errors";
import { GENDERS, LOOKING_FOR } from "../../config/constants";
import { parseJsonArray, publicProfile } from "../../lib/serializers";
import { trackFunnelOnce } from "../../lib/analytics";
import { ageFromDob } from "../../lib/age";

const uploadDir = path.resolve(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${userIdOf(req)}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) cb(new Error("Solo imágenes"));
    else cb(null, true);
  },
});

const profileSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  gender: z.enum(GENDERS).optional(),
  interestedIn: z.array(z.enum(GENDERS)).min(1).optional(),
  lookingFor: z.enum(LOOKING_FOR).optional(),
  city: z.string().max(80).optional(),
  zone: z.string().max(80).optional(),
  maxDistanceKm: z.number().int().min(1).max(500).optional(),
  ageMin: z.number().int().min(18).max(99).optional(),
  ageMax: z.number().int().min(18).max(99).optional(),
  bio: z.string().max(500).optional(),
  job: z.string().max(80).nullable().optional(),
  studies: z.string().max(80).nullable().optional(),
  interests: z.array(z.string().max(40)).max(20).optional(),
});

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().max(80).optional(),
  zone: z.string().max(80).optional(),
});

export const meRouter = Router();

meRouter.get("/", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const user = await loadUser(userId);
    if (!user) throw notFound();
    res.json(serializeMe(user));
  } catch (err) {
    next(err);
  }
});

meRouter.patch("/", validate(profileSchema), async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const body = req.body as z.infer<typeof profileSchema>;
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw notFound("Perfil no encontrado");
    const ageMin = body.ageMin ?? profile.ageMin;
    const ageMax = body.ageMax ?? profile.ageMax;
    if (ageMin > ageMax) throw badRequest("El rango de edad es inválido");

    const updated = await prisma.profile.update({
      where: { userId },
      data: {
        displayName: body.name,
        gender: body.gender,
        interestedIn: body.interestedIn ? JSON.stringify(body.interestedIn) : undefined,
        lookingFor: body.lookingFor,
        city: body.city,
        zone: body.zone,
        maxDistanceKm: body.maxDistanceKm,
        ageMin: body.ageMin,
        ageMax: body.ageMax,
        bio: body.bio,
        job: body.job === undefined ? undefined : body.job,
        studies: body.studies === undefined ? undefined : body.studies,
        interests: body.interests ? JSON.stringify(body.interests) : undefined,
      },
    });

    const photos = await prisma.photo.count({ where: { userId } });
    const complete =
      Boolean(updated.displayName) &&
      Boolean(updated.gender) &&
      parseJsonArray(updated.interestedIn).length > 0 &&
      Boolean(updated.city || (updated.latitude != null && updated.longitude != null)) &&
      photos >= 1;
    if (complete && !updated.onboardingCompletedAt) {
      await prisma.profile.update({
        where: { userId },
        data: { onboardingCompletedAt: new Date() },
      });
      await trackFunnelOnce(userId, "PROFILE_COMPLETED");
    }
    const user = await loadUser(userId);
    if (!user) throw notFound();
    res.json(serializeMe(user));
  } catch (err) {
    next(err);
  }
});

meRouter.patch("/location", validate(locationSchema), async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const body = req.body as z.infer<typeof locationSchema>;
    await prisma.profile.update({
      where: { userId },
      data: {
        latitude: body.latitude,
        longitude: body.longitude,
        city: body.city,
        zone: body.zone,
        locationUpdatedAt: new Date(),
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

meRouter.post("/photos", upload.single("photo"), async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    if (!req.file) throw badRequest("Falta la fotografía");
    const count = await prisma.photo.count({ where: { userId } });
    if (count >= env.maxPhotos) throw badRequest(`Máximo ${env.maxPhotos} fotografías`);
    const photo = await prisma.photo.create({
      data: {
        userId,
        url: `/uploads/${req.file.filename}`,
        position: count,
      },
    });
    res.status(201).json(photo);
  } catch (err) {
    next(err);
  }
});

meRouter.delete("/photos/:id", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const photo = await prisma.photo.findFirst({ where: { id: req.params.id, userId } });
    if (!photo) throw notFound("Foto no encontrada");
    await prisma.photo.delete({ where: { id: photo.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

meRouter.patch(
  "/photos/reorder",
  validate(z.object({ ids: z.array(z.string()).min(1) })),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const ids = (req.body as { ids: string[] }).ids;
      const photos = await prisma.photo.findMany({ where: { userId } });
      if (photos.length !== ids.length || photos.some((p) => !ids.includes(p.id))) {
        throw badRequest("Lista de fotos inválida");
      }
      await prisma.$transaction(
        ids.map((id, position) => prisma.photo.update({ where: { id }, data: { position } }))
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

meRouter.get("/notifications", async (req, res, next) => {
  try {
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: userIdOf(req) },
    });
    res.json(prefs);
  } catch (err) {
    next(err);
  }
});

meRouter.patch("/notifications", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const allowed = [
      "newMatch",
      "newMessage",
      "dateProposal",
      "dateAccepted",
      "dateReminder",
      "verifyMoment",
      "coinsReceived",
      "personOfTheDay",
    ] as const;
    const data: Record<string, boolean> = {};
    for (const key of allowed) {
      if (typeof req.body?.[key] === "boolean") data[key] = req.body[key];
    }
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    res.json(prefs);
  } catch (err) {
    next(err);
  }
});

meRouter.post(
  "/push-token",
  validate(z.object({ token: z.string().min(8), platform: z.enum(["IOS", "ANDROID"]) })),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const { token, platform } = req.body as { token: string; platform: string };
      await prisma.pushToken.upsert({
        where: { token },
        update: { userId, platform },
        create: { userId, token, platform },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export const usersRouter = Router();

usersRouter.get("/:id", async (req, res, next) => {
  try {
    const viewerId = userIdOf(req);
    const blocked = await isBlocked(viewerId, req.params.id);
    if (blocked) throw notFound();
    const user = await loadUser(req.params.id);
    if (!user || user.status !== "ACTIVE") throw notFound();
    const viewer = await prisma.profile.findUnique({ where: { userId: viewerId } });
    res.json(
      publicProfile(user, { latitude: viewer?.latitude, longitude: viewer?.longitude })
    );
  } catch (err) {
    next(err);
  }
});

async function loadUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { profile: true, photos: true, wallet: true, reputation: true },
  });
}

function serializeMe(
  user: NonNullable<Awaited<ReturnType<typeof loadUser>>>
) {
  const profile = user.profile;
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth,
    age: ageFromDob(user.dateOfBirth),
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    status: user.status,
    role: user.role,
    profile: profile
      ? {
          name: profile.displayName,
          gender: profile.gender,
          interestedIn: parseJsonArray(profile.interestedIn),
          lookingFor: profile.lookingFor,
          city: profile.city,
          zone: profile.zone,
          hasLocation: profile.latitude != null && profile.longitude != null,
          maxDistanceKm: profile.maxDistanceKm,
          ageMin: profile.ageMin,
          ageMax: profile.ageMax,
          bio: profile.bio,
          job: profile.job,
          studies: profile.studies,
          interests: parseJsonArray(profile.interests),
          verified: Boolean(profile.verifiedAt || user.emailVerifiedAt),
          verificationMethod: profile.verificationMethod,
          onboardingCompleted: Boolean(profile.onboardingCompletedAt),
          photos: [...user.photos]
            .sort((a, b) => a.position - b.position)
            .map((p) => ({ id: p.id, url: p.url, position: p.position })),
          badges: {
            verified: Boolean(profile.verifiedAt || user.emailVerifiedAt),
            reliable: Boolean(user.reputation?.reliableBadge),
          },
        }
      : null,
    wallet: user.wallet
      ? {
          balance: user.wallet.earnedBalance + user.wallet.purchasedBalance,
          earnedBalance: user.wallet.earnedBalance,
          purchasedBalance: user.wallet.purchasedBalance,
        }
      : { balance: 0, earnedBalance: 0, purchasedBalance: 0 },
  };
}

export async function isBlocked(a: string, b: string): Promise<boolean> {
  const row = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return Boolean(row);
}
