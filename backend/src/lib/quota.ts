import { utcDay } from "./age";
import { prisma } from "./prisma";

export async function getOrCreateQuota(userId: string) {
  const day = utcDay();
  return prisma.dailyQuota.upsert({
    where: { userId_day: { userId, day } },
    update: {},
    create: { userId, day },
  });
}

export function remainingProfiles(
  quota: { profilesUsed: number; extraProfiles: number },
  dailyLimit: number
) {
  return Math.max(0, dailyLimit + quota.extraProfiles - quota.profilesUsed);
}
