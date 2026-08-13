import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { userIdOf } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { badRequest, conflict } from "../../lib/errors";
import { CONNECTION_STATUS } from "../../config/constants";
import { otherUserId } from "../../lib/serializers";
import { getSettings } from "../../lib/settings";
import { env } from "../../config/env";
import { randomCode, sha256 } from "../../lib/tokens";
import { haversineMeters } from "../../lib/geo";
import { creditEarned } from "../../lib/wallet";
import { trackFunnelOnce, flagSuspicious } from "../../lib/analytics";
import { notify } from "../../lib/notifications";
import { mustParticipate } from "../matches/routes";
import {
  cancelSchema,
  confirmSchema,
  noShowSchema,
  proposeSchema,
  respondSchema,
  scanSchema,
} from "./schema";

export const datesRouter = Router();

datesRouter.post("/matches/:id/proposals", validate(proposeSchema), async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const connection = await mustParticipate(req.params.id, userId);
    if ([CONNECTION_STATUS.INACTIVE, CONNECTION_STATUS.ARCHIVED].includes(connection.status as never)) {
      throw conflict("Este match no admite propuestas");
    }
    const scheduledAt = new Date(req.body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000) {
      throw badRequest("Fecha y horario inválidos");
    }
    const open = await prisma.dateProposal.findFirst({
      where: { connectionId: connection.id, status: { in: ["PENDING", "ACCEPTED"] } },
    });
    if (open) throw conflict("Ya hay una propuesta o cita activa");

    const proposal = await prisma.dateProposal.create({
      data: {
        connectionId: connection.id,
        proposedById: userId,
        scheduledAt,
        zone: req.body.zone,
        planType: req.body.planType,
        note: req.body.note,
        status: "PENDING",
      },
    });
    await prisma.message.create({
      data: {
        connectionId: connection.id,
        senderId: userId,
        type: "DATE_PROPOSAL",
        content: JSON.stringify({ proposalId: proposal.id, scheduledAt, zone: req.body.zone, planType: req.body.planType }),
      },
    });
    await prisma.connection.update({
      where: { id: connection.id },
      data: { status: CONNECTION_STATUS.PROPOSAL, lastMessageAt: new Date() },
    });
    await trackFunnelOnce(userId, "FIRST_PROPOSAL");
    const settings = await getSettings();
    await notify({
      userId: otherUserId(connection, userId),
      type: "DATE_PROPOSAL",
      title: settings.proposalLabel,
      body: "Quiere verte.",
      data: { proposalId: proposal.id, connectionId: connection.id },
    });
    res.status(201).json(proposal);
  } catch (err) {
    next(err);
  }
});

datesRouter.post(
  "/proposals/:id/respond",
  validate(respondSchema),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const proposal = await prisma.dateProposal.findUnique({ where: { id: req.params.id } });
      if (!proposal || proposal.status !== "PENDING") throw conflict("Propuesta no disponible");
      const connection = await mustParticipate(proposal.connectionId, userId);
      if (proposal.proposedById === userId) throw conflict("No podés responder tu propia propuesta");
      const { action } = req.body as { action: string };

      if (action === "DECLINE") {
        await prisma.dateProposal.update({ where: { id: proposal.id }, data: { status: "DECLINED" } });
        await prisma.connection.update({
          where: { id: connection.id },
          data: { status: connection.lastMessageAt ? CONNECTION_STATUS.TALKING : CONNECTION_STATUS.MATCH },
        });
        res.json({ ok: true, status: "DECLINED" });
        return;
      }

      if (action === "COUNTER") {
        if (!req.body.scheduledAt || !req.body.zone || !req.body.planType) {
          throw badRequest("Para proponer otro horario necesitás fecha, zona y tipo de plan");
        }
        const scheduledAt = new Date(req.body.scheduledAt);
        await prisma.dateProposal.update({ where: { id: proposal.id }, data: { status: "COUNTERED" } });
        const counter = await prisma.dateProposal.create({
          data: {
            connectionId: connection.id,
            proposedById: userId,
            scheduledAt,
            zone: req.body.zone,
            planType: req.body.planType,
            status: "PENDING",
            parentId: proposal.id,
          },
        });
        await notify({
          userId: proposal.proposedById,
          type: "DATE_PROPOSAL",
          title: "Otro horario",
          body: "Te propusieron otro horario",
          data: { proposalId: counter.id },
        });
        res.json(counter);
        return;
      }

      await prisma.dateProposal.update({ where: { id: proposal.id }, data: { status: "ACCEPTED" } });
      await prisma.connection.update({
        where: { id: connection.id },
        data: { status: CONNECTION_STATUS.DATE_AGREED },
      });
      const settings = await getSettings();
      await creditEarned({
        userId: connection.userLowId,
        amount: settings.rewards.DATE_ACCEPTED,
        reason: "DATE_ACCEPTED",
        referenceType: "PROPOSAL",
        referenceId: proposal.id,
      });
      await creditEarned({
        userId: connection.userHighId,
        amount: settings.rewards.DATE_ACCEPTED,
        reason: "DATE_ACCEPTED",
        referenceType: "PROPOSAL",
        referenceId: proposal.id,
      });
      await trackFunnelOnce(userId, "FIRST_DATE_ACCEPTED");
      await trackFunnelOnce(proposal.proposedById, "FIRST_DATE_ACCEPTED");
      await notify({
        userId: proposal.proposedById,
        type: "DATE_ACCEPTED",
        title: "Cita acordada",
        body: "Aceptaron tu propuesta",
        data: { proposalId: proposal.id },
      });
      res.json({ ok: true, status: "ACCEPTED", proposalId: proposal.id });
    } catch (err) {
      next(err);
    }
  }
);

datesRouter.post(
  "/proposals/:id/cancel",
  validate(cancelSchema),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const proposal = await prisma.dateProposal.findUnique({ where: { id: req.params.id } });
      if (!proposal) throw conflict("Propuesta no encontrada");
      const connection = await mustParticipate(proposal.connectionId, userId);
      if (!["PENDING", "ACCEPTED"].includes(proposal.status)) throw conflict("No se puede cancelar");
      await prisma.dateProposal.update({
        where: { id: proposal.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: req.body.reason,
          cancelledById: userId,
        },
      });
      await prisma.connection.update({
        where: { id: connection.id },
        data: { status: CONNECTION_STATUS.TALKING },
      });
      await prisma.reputation.update({
        where: { userId },
        data: { cancellations: { increment: 1 } },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

datesRouter.post("/proposals/:id/qr", async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const proposal = await prisma.dateProposal.findUnique({ where: { id: req.params.id } });
    if (!proposal || proposal.status !== "ACCEPTED") throw conflict("No hay cita acordada");
    await mustParticipate(proposal.connectionId, userId);
    const settings = await getSettings();
    const token = randomCode(8);
    const lat = typeof req.body?.latitude === "number" ? req.body.latitude : null;
    const lng = typeof req.body?.longitude === "number" ? req.body.longitude : null;
    await prisma.checkInToken.create({
      data: {
        connectionId: proposal.connectionId,
        proposalId: proposal.id,
        createdById: userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + settings.qrValiditySeconds * 1000),
        creatorLat: lat,
        creatorLng: lng,
      },
    });
    res.json({
      token,
      expiresInSeconds: settings.qrValiditySeconds,
      payload: `hqp://checkin/${token}`,
    });
  } catch (err) {
    next(err);
  }
});

datesRouter.post(
  "/check-in/scan",
  validate(scanSchema),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const tokenHash = sha256((req.body as { token: string }).token.toUpperCase());
      const row = await prisma.checkInToken.findUnique({ where: { tokenHash } });
      if (!row) throw badRequest("Código inválido");
      if (row.usedAt) {
        await flagSuspicious("QR_REUSE", userId, { tokenId: row.id });
        throw conflict("Este código ya fue usado");
      }
      if (row.expiresAt < new Date()) throw conflict("El código expiró");
      if (row.createdById === userId) throw conflict("La otra persona debe escanear el código");
      const connection = await mustParticipate(row.connectionId, userId);

      let distanceM: number | null = null;
      const settings = await getSettings();
      const locationOn = env.checkInLocationEnabled || settings.checkInLocationEnabled;
      if (locationOn && row.creatorLat != null && row.creatorLng != null && req.body.latitude != null && req.body.longitude != null) {
        distanceM = haversineMeters(row.creatorLat, row.creatorLng, req.body.latitude, req.body.longitude);
        if (distanceM > settings.checkInMaxDistanceMeters) {
          await flagSuspicious("CHECKIN_DISTANCE", userId, { distanceM, proposalId: row.proposalId });
          throw conflict("Los dispositivos no parecen estar en la misma zona");
        }
      }

      await prisma.checkInToken.update({
        where: { id: row.id },
        data: {
          usedAt: new Date(),
          usedById: userId,
          scannerLat: req.body.latitude,
          scannerLng: req.body.longitude,
          distanceM,
        },
      });
      await prisma.dateVerification.upsert({
        where: { proposalId: row.proposalId },
        update: { qrValidatedAt: new Date() },
        create: {
          connectionId: row.connectionId,
          proposalId: row.proposalId,
          qrValidatedAt: new Date(),
        },
      });
      await notify({
        userId: row.createdById,
        type: "VERIFY",
        title: "Check-in completado",
        body: "El encuentro quedó registrado",
        data: { proposalId: row.proposalId },
      });
      await notify({
        userId: otherUserId(connection, row.createdById),
        type: "VERIFY",
        title: "Check-in completado",
        body: "El encuentro quedó registrado",
        data: { proposalId: row.proposalId },
      });
      const complete = await maybeCompleteVerification(row.proposalId);
      res.json({ ok: true, checkInCompleted: true, dateVerified: complete });
    } catch (err) {
      next(err);
    }
  }
);

datesRouter.post(
  "/proposals/:id/confirm",
  validate(confirmSchema),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const proposal = await prisma.dateProposal.findUnique({ where: { id: req.params.id } });
      if (!proposal || proposal.status !== "ACCEPTED") throw conflict("Cita no disponible");
      await mustParticipate(proposal.connectionId, userId);
      await prisma.dateConfirmation.upsert({
        where: { proposalId_userId: { proposalId: proposal.id, userId } },
        update: { sawEachOther: req.body.sawEachOther },
        create: {
          connectionId: proposal.connectionId,
          proposalId: proposal.id,
          userId,
          sawEachOther: req.body.sawEachOther,
        },
      });
      const complete = await maybeCompleteVerification(proposal.id);
      res.json({ ok: true, dateVerified: complete });
    } catch (err) {
      next(err);
    }
  }
);

datesRouter.post(
  "/proposals/:id/no-show",
  validate(noShowSchema),
  async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const proposal = await prisma.dateProposal.findUnique({ where: { id: req.params.id } });
      if (!proposal) throw conflict("Cita no encontrada");
      const connection = await mustParticipate(proposal.connectionId, userId);
      if (proposal.scheduledAt > new Date()) throw conflict("Todavía no pasó el horario acordado");
      await prisma.dateConfirmation.upsert({
        where: { proposalId_userId: { proposalId: proposal.id, userId } },
        update: { otherAppeared: req.body.otherAppeared },
        create: {
          connectionId: proposal.connectionId,
          proposalId: proposal.id,
          userId,
          otherAppeared: req.body.otherAppeared,
        },
      });
      if (req.body.otherAppeared === false) {
        const other = otherUserId(connection, userId);
        await prisma.reputation.update({
          where: { userId: other },
          data: { noShows: { increment: 1 } },
        });
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

async function maybeCompleteVerification(proposalId: string): Promise<boolean> {
  const proposal = await prisma.dateProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) return false;
  const verification = await prisma.dateVerification.findFirst({ where: { proposalId } });
  if (!verification?.qrValidatedAt || verification.verifiedAt) return Boolean(verification?.verifiedAt);
  const confirms = await prisma.dateConfirmation.findMany({ where: { proposalId } });
  if (confirms.length < 2 || confirms.some((c) => c.sawEachOther !== true)) return false;

  const connection = await prisma.connection.findUnique({ where: { id: proposal.connectionId } });
  if (!connection) return false;

  const already = connection.verifiedDateCount;
  const nextCount = already + 1;
  const isSecond = already >= 1;
  const nextStatus = isSecond ? CONNECTION_STATUS.SECOND_DATE : CONNECTION_STATUS.DATE_VERIFIED;

  await prisma.dateVerification.update({
    where: { id: verification.id },
    data: { verifiedAt: new Date() },
  });
  await prisma.connection.update({
    where: { id: connection.id },
    data: { status: nextStatus, verifiedDateCount: nextCount },
  });

  const settings = await getSettings();
  const reason = isSecond ? "SECOND_DATE_VERIFIED" : "DATE_VERIFIED";
  const amount = isSecond ? settings.rewards.SECOND_DATE_VERIFIED : settings.rewards.DATE_VERIFIED;
  await creditEarned({
    userId: connection.userLowId,
    amount,
    reason,
    referenceType: "PROPOSAL",
    referenceId: proposalId,
  });
  await creditEarned({
    userId: connection.userHighId,
    amount,
    reason,
    referenceType: "PROPOSAL",
    referenceId: proposalId,
  });
  await prisma.reputation.update({
    where: { userId: connection.userLowId },
    data: { verifiedDates: { increment: 1 } },
  });
  await prisma.reputation.update({
    where: { userId: connection.userHighId },
    data: { verifiedDates: { increment: 1 } },
  });
  await maybeReliable(connection.userLowId);
  await maybeReliable(connection.userHighId);
  await trackFunnelOnce(connection.userLowId, "FIRST_DATE_VERIFIED");
  await trackFunnelOnce(connection.userHighId, "FIRST_DATE_VERIFIED");
  return true;
}

async function maybeReliable(userId: string) {
  const rep = await prisma.reputation.findUnique({ where: { userId } });
  if (!rep) return;
  const reliable = rep.verifiedDates >= 2 && rep.noShows === 0 && rep.reportsReceived === 0;
  if (reliable !== rep.reliableBadge) {
    await prisma.reputation.update({ where: { userId }, data: { reliableBadge: reliable } });
  }
}
