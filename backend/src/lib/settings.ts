import { DEFAULT_SETTINGS, type AppSettings } from "../config/constants";
import { prisma } from "./prisma";

const SETTINGS_KEY = "app";

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_SETTINGS;
  return deepMerge(DEFAULT_SETTINGS, JSON.parse(row.value));
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = deepMerge(current, partial);
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
  });
  return next;
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch == null || typeof patch !== "object") return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const prev = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && prev && typeof prev === "object") {
      out[k] = deepMerge(prev, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}
