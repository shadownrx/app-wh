import { CONNECTION_STATUS } from "../config/constants";
import { prisma } from "../lib/prisma";
import { getSettings } from "../lib/settings";

export async function expireInactiveMatches(userId?: string) {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.matchInactiveHours * 60 * 60 * 1000);
  await prisma.connection.updateMany({
    where: {
      status: CONNECTION_STATUS.MATCH,
      lastMessageAt: null,
      matchedAt: { lt: cutoff },
      ...(userId ? { OR: [{ userLowId: userId }, { userHighId: userId }] } : {}),
    },
    data: { status: CONNECTION_STATUS.INACTIVE, inactiveAt: new Date() },
  });
}
