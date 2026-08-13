import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV !== "test") {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "file:./dev.db"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
  jwtRefreshExpiresDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 30),
  appName: process.env.APP_NAME ?? "Hacé que pase",
  publicUrl: process.env.APP_PUBLIC_URL ?? "http://localhost:4000",
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  maxPhotos: Number(process.env.MAX_PHOTOS ?? 6),
  checkInLocationEnabled: process.env.CHECKIN_LOCATION_ENABLED === "true",
  checkInMaxDistanceMeters: Number(process.env.CHECKIN_MAX_DISTANCE_METERS ?? 500),
  isTest: (process.env.NODE_ENV ?? "") === "test",
};
