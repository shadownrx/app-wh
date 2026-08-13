import { z } from "zod";

export const userStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
  reason: z.string().optional(),
});

export const verifyUserSchema = z.object({
  method: z.enum(["EMAIL", "PHONE", "SELFIE", "MANUAL"]).default("MANUAL"),
});

export const walletAdjustSchema = z.object({
  amount: z.number().int(),
  reason: z.string().min(3),
});

export const reportUpdateSchema = z.object({
  status: z.enum(["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]),
  resolution: z.string().optional(),
});
