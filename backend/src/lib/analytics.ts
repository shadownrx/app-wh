import { prisma } from "./prisma";
import { FUNNEL_EVENTS } from "../config/constants";

export async function track(
  name: string,
  userId?: string | null,
  properties: Record<string, unknown> = {}
) {
  await prisma.analyticsEvent.create({
    data: {
      userId: userId ?? undefined,
      name,
      properties: JSON.stringify(properties),
    },
  });
}

export async function trackFunnelOnce(userId: string, name: (typeof FUNNEL_EVENTS)[number]) {
  const existing = await prisma.analyticsEvent.findFirst({
    where: { userId, name },
  });
  if (existing) return false;
  await track(name, userId);
  return true;
}

export async function flagSuspicious(
  type: string,
  userId: string | null,
  details: Record<string, unknown>
) {
  await prisma.suspiciousActivity.create({
    data: {
      userId: userId ?? undefined,
      type,
      details: JSON.stringify(details),
    },
  });
}
