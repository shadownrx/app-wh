import request from "supertest";
import { Express } from "express";
import { execSync } from "child_process";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { createApp } from "../src/app";
import { bootstrapCatalog } from "../src/lib/bootstrap";

const TEST_DB = "file:./test.db";
let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  execSync("npx prisma db push --skip-generate", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: TEST_DB },
  });
  schemaReady = true;
}

export async function resetDb() {
  await ensureSchema();
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'
  `;
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table.name}"`);
  }
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await bootstrapCatalog();
}

export function app(): Express {
  return createApp();
}

export async function register(
  server: Express,
  overrides: Record<string, unknown> = {}
) {
  const email = String(overrides.email ?? `u${Date.now()}${Math.random().toString(16).slice(2)}@test.local`);
  const res = await request(server)
    .post("/api/auth/register")
    .send({
      email,
      password: "Password123!",
      dateOfBirth: "1998-05-10",
      termsAccepted: true,
      privacyAccepted: true,
      name: "Test",
      gender: "WOMAN",
      ...overrides,
    });
  return res;
}

export async function completeProfile(
  server: Express,
  token: string,
  body: Record<string, unknown> = {}
) {
  return request(server)
    .patch("/api/me")
    .set("Authorization", `Bearer ${token}`)
    .send({
      interestedIn: ["MAN"],
      lookingFor: "DATING",
      city: "La Plata",
      maxDistanceKm: 50,
      ageMin: 18,
      ageMax: 45,
      bio: "Hola",
      interests: ["café", "cine"],
      ...body,
    });
}

export async function setLocation(server: Express, token: string, lat = -34.921, lng = -57.954) {
  return request(server)
    .patch("/api/me/location")
    .set("Authorization", `Bearer ${token}`)
    .send({ latitude: lat, longitude: lng, city: "La Plata" });
}

export { prisma };
