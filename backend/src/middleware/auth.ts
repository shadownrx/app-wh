import { Request, Response, NextFunction } from "express";
import { AppError, unauthorized } from "../lib/errors";
import { verifyAccessToken } from "../lib/tokens";
import { prisma } from "../lib/prisma";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      role?: string;
    }
  }
}

export type AuthedRequest = Request & {
  userId: string;
  role: string;
};

export function userIdOf(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw unauthorized();
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status === "DELETED") throw unauthorized("Cuenta no disponible");
    if (user.status === "BANNED") throw unauthorized("Cuenta baneada");
    if (user.status === "SUSPENDED") throw unauthorized("Cuenta suspendida");
    req.userId = user.id;
    req.role = user.role;
    prisma.user
      .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
      .catch(() => undefined);
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(unauthorized("Token inválido o vencido"));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.role !== "ADMIN") {
    next(unauthorized("Se requiere administrador"));
    return;
  }
  next();
}
