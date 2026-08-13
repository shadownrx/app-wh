import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { utcDay } from "./age";
import { conflict } from "./errors";
import { notify } from "./notifications";
import { flagSuspicious } from "./analytics";

export async function ensureWallet(userId: string) {
  return prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function creditEarned(params: {
  userId: string;
  amount: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
}) {
  if (params.amount <= 0) return null;
  const settings = await getSettings();
  const day = utcDay();
  const quota = await prisma.dailyQuota.upsert({
    where: { userId_day: { userId: params.userId, day } },
    update: {},
    create: { userId: params.userId, day },
  });
  const remaining = Math.max(0, settings.dailyEarnedCap - quota.earnedToday);
  const amount = Math.min(params.amount, remaining);
  if (amount <= 0) {
    await flagSuspicious("DAILY_EARNED_CAP", params.userId, { reason: params.reason });
    return null;
  }
  const [wallet] = await prisma.$transaction([
    prisma.wallet.upsert({
      where: { userId: params.userId },
      update: { earnedBalance: { increment: amount } },
      create: { userId: params.userId, earnedBalance: amount },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: params.userId,
        amount,
        direction: "CREDIT",
        source: "EARNED",
        reason: params.reason,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
      },
    }),
    prisma.dailyQuota.update({
      where: { userId_day: { userId: params.userId, day } },
      data: { earnedToday: { increment: amount } },
    }),
  ]);
  await notify({
    userId: params.userId,
    type: "COINS",
    title: `+${amount} ${settings.currencyName}`,
    body: rewardLabel(params.reason),
    data: { reason: params.reason, amount },
  });
  return wallet;
}

export async function debit(params: {
  userId: string;
  amount: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
}) {
  if (params.amount <= 0) throw conflict("Monto inválido");
  const wallet = await ensureWallet(params.userId);
  const total = wallet.earnedBalance + wallet.purchasedBalance;
  if (total < params.amount) throw conflict("Saldo insuficiente");

  let fromEarned = Math.min(wallet.earnedBalance, params.amount);
  let fromPurchased = params.amount - fromEarned;

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId: params.userId },
      data: {
        earnedBalance: { decrement: fromEarned },
        purchasedBalance: { decrement: fromPurchased },
      },
    });
    if (fromEarned > 0) {
      await tx.walletTransaction.create({
        data: {
          userId: params.userId,
          amount: fromEarned,
          direction: "DEBIT",
          source: "EARNED",
          reason: params.reason,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
        },
      });
    }
    if (fromPurchased > 0) {
      await tx.walletTransaction.create({
        data: {
          userId: params.userId,
          amount: fromPurchased,
          direction: "DEBIT",
          source: "PURCHASED",
          reason: params.reason,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
        },
      });
    }
  });
}

export async function adminAdjust(params: {
  userId: string;
  amount: number;
  reason: string;
  adminId: string;
}) {
  await ensureWallet(params.userId);
  if (params.amount === 0) return;
  if (params.amount > 0) {
    await prisma.wallet.update({
      where: { userId: params.userId },
      data: { earnedBalance: { increment: params.amount } },
    });
    await prisma.walletTransaction.create({
      data: {
        userId: params.userId,
        amount: params.amount,
        direction: "CREDIT",
        source: "EARNED",
        reason: params.reason,
        referenceType: "ADMIN",
        referenceId: params.adminId,
      },
    });
  } else {
    const abs = Math.abs(params.amount);
    await debit({
      userId: params.userId,
      amount: abs,
      reason: params.reason,
      referenceType: "ADMIN",
      referenceId: params.adminId,
    });
  }
}

function rewardLabel(reason: string): string {
  const map: Record<string, string> = {
    MATCH: "Nuevo match",
    MEANINGFUL_CONVERSATION: "Conversación significativa",
    DATE_ACCEPTED: "Cita acordada",
    DATE_VERIFIED: "Cita verificada",
    SECOND_DATE_VERIFIED: "Segunda cita verificada",
    JOINT_PHOTO: "Foto conjunta",
  };
  return map[reason] ?? reason;
}
