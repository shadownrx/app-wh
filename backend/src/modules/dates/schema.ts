import { z } from "zod";
import { PLAN_TYPES } from "../../config/constants";

export const proposeSchema = z.object({
  scheduledAt: z.string(),
  zone: z.string().min(1).max(80),
  planType: z.enum(PLAN_TYPES),
  note: z.string().max(200).optional(),
});

export const respondSchema = z.object({
  action: z.enum(["ACCEPT", "COUNTER", "DECLINE"]),
  scheduledAt: z.string().optional(),
  zone: z.string().max(80).optional(),
  planType: z.enum(PLAN_TYPES).optional(),
});

export const cancelSchema = z.object({
  reason: z.enum(["SOMETHING_CAME_UP", "CHANGED_MIND", "UNCOMFORTABLE", "OTHER"]).optional(),
});

export const scanSchema = z.object({
  token: z.string().min(4),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const confirmSchema = z.object({ sawEachOther: z.boolean() });

export const noShowSchema = z.object({ otherAppeared: z.boolean() });
