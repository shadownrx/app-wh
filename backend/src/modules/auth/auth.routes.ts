import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { badRequest, conflict, unauthorized, notFound } from "../../lib/errors";
import { ageFromDob } from "../../lib/age";
import { randomToken, sha256, signAccessToken } from "../../lib/tokens";
import { sendMail, getDevInbox } from "../../lib/mailer";
import { env } from "../../config/env";
import { track, trackFunnelOnce } from "../../lib/analytics";
import { validate } from "../../middleware/validate";
import { requireAuth, userIdOf } from "../../middleware/auth";
import { GENDERS } from "../../config/constants";

const registerSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(100),
  dateOfBirth: z.string(),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  phone: z.string().min(8).max(20).optional(),
  name: z.string().min(1).max(40).optional(),
  gender: z.enum(GENDERS).optional(),
});

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

const resetRequestSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(100),
});

const verifySchema = z.object({ token: z.string().min(10) });

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof registerSchema>;
    const dob = new Date(body.dateOfBirth);
    if (Number.isNaN(dob.getTime())) throw badRequest("Fecha de nacimiento inválida");
    if (ageFromDob(dob) < 18) {
      throw badRequest("La aplicación es exclusivamente para mayores de 18 años");
    }
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict("Ese email ya está registrado");
    if (body.phone) {
      const phoneTaken = await prisma.user.findUnique({ where: { phone: body.phone } });
      if (phoneTaken) throw conflict("Ese teléfono ya está registrado");
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const now = new Date();
    const user = await prisma.user.create({
      data: {
        email: body.email,
        phone: body.phone,
        passwordHash,
        dateOfBirth: dob,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        profile: {
          create: {
            displayName: body.name ?? body.email.split("@")[0],
            gender: body.gender ?? "OTHER",
          },
        },
        wallet: { create: {} },
        notificationPreference: { create: {} },
        reputation: { create: {} },
      },
    });

    const verifyRaw = randomToken(24);
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        type: "VERIFY_EMAIL",
        tokenHash: sha256(verifyRaw),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    await sendMail(
      user.email,
      "Verificá tu email",
      `Usá este token para verificar tu cuenta: ${verifyRaw}\n${env.publicUrl}/api/auth/verify-email`
    );
    await trackFunnelOnce(user.id, "REGISTERED");
    await track("REGISTERED", user.id);

    const tokens = await issueTokens(user.id, user.role);
    res.status(201).json({
      user: serializeAuthUser(user),
      ...tokens,
      emailVerificationRequired: true,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status === "DELETED") throw unauthorized("Credenciales inválidas");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw unauthorized("Credenciales inválidas");
    if (user.status === "BANNED") throw unauthorized("Cuenta baneada");
    if (user.status === "SUSPENDED") throw unauthorized("Cuenta suspendida");
    const tokens = await issueTokens(user.id, user.role);
    res.json({ user: serializeAuthUser(user), ...tokens });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refreshToken ?? "");
    if (!refreshToken) throw unauthorized();
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!row || row.revokedAt || row.expiresAt < new Date()) throw unauthorized("Refresh inválido");
    if (row.user.status !== "ACTIVE") throw unauthorized("Cuenta no disponible");
    await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    const tokens = await issueTokens(row.user.id, row.user.role);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refreshToken ?? "");
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(refreshToken) },
        data: { revokedAt: new Date() },
      });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/verify-email", validate(verifySchema), async (req, res, next) => {
  try {
    const tokenHash = sha256((req.body as z.infer<typeof verifySchema>).token);
    const row = await prisma.emailToken.findUnique({ where: { tokenHash } });
    if (!row || row.type !== "VERIFY_EMAIL" || row.usedAt || row.expiresAt < new Date()) {
      throw badRequest("Token de verificación inválido o vencido");
    }
    await prisma.$transaction([
      prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
      prisma.profile.updateMany({
        where: { userId: row.userId, verifiedAt: null },
        data: { verifiedAt: new Date(), verificationMethod: "EMAIL" },
      }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/resend-verification", requireAuth, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound();
    if (user.emailVerifiedAt) {
      res.json({ ok: true, alreadyVerified: true });
      return;
    }
    const verifyRaw = randomToken(24);
    await prisma.emailToken.create({
      data: {
        userId,
        type: "VERIFY_EMAIL",
        tokenHash: sha256(verifyRaw),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    await sendMail(user.email, "Verificá tu email", `Token: ${verifyRaw}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/forgot-password", validate(resetRequestSchema), async (req, res, next) => {
  try {
    const { email } = req.body as z.infer<typeof resetRequestSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.status === "ACTIVE") {
      const raw = randomToken(24);
      await prisma.emailToken.create({
        data: {
          userId: user.id,
          type: "RESET_PASSWORD",
          tokenHash: sha256(raw),
          expiresAt: new Date(Date.now() + 1000 * 60 * 30),
        },
      });
      await sendMail(user.email, "Recuperá tu contraseña", `Token de reset: ${raw}`);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/reset-password", validate(resetSchema), async (req, res, next) => {
  try {
    const { token, password } = req.body as z.infer<typeof resetSchema>;
    const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.type !== "RESET_PASSWORD" || row.usedAt || row.expiresAt < new Date()) {
      throw badRequest("Token de recuperación inválido o vencido");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.delete("/account", requireAuth, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        email: `deleted_${userId}@invalid.local`,
        phone: null,
        passwordHash: await bcrypt.hash(randomToken(16), 8),
      },
    });
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

if (env.nodeEnv !== "production") {
  authRouter.get("/dev-inbox", (_req, res) => {
    res.json({ inbox: getDevInbox() });
  });
}

async function issueTokens(userId: string, role: string) {
  const accessToken = signAccessToken(userId, role);
  const refreshToken = randomToken(32);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.jwtRefreshExpiresDays * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken, refreshToken };
}

function serializeAuthUser(user: {
  id: string;
  email: string;
  phone: string | null;
  dateOfBirth: Date;
  emailVerifiedAt: Date | null;
  status: string;
  role: string;
}) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth,
    age: ageFromDob(user.dateOfBirth),
    emailVerified: Boolean(user.emailVerifiedAt),
    status: user.status,
    role: user.role,
  };
}
