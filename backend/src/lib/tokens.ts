import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function randomCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export type AccessPayload = {
  sub: string;
  role: string;
  typ: "access";
};

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role, typ: "access" } satisfies AccessPayload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpires as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, env.jwtAccessSecret) as AccessPayload;
  if (payload.typ !== "access") throw new Error("Invalid token");
  return payload;
}
