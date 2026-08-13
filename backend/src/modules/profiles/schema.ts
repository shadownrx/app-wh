import { z } from "zod";
import { GENDERS, LOOKING_FOR } from "../../config/constants";

export const profileSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  gender: z.enum(GENDERS).optional(),
  interestedIn: z.array(z.enum(GENDERS)).min(1).optional(),
  lookingFor: z.enum(LOOKING_FOR).optional(),
  city: z.string().max(80).optional(),
  zone: z.string().max(80).optional(),
  maxDistanceKm: z.number().int().min(1).max(500).optional(),
  ageMin: z.number().int().min(18).max(99).optional(),
  ageMax: z.number().int().min(18).max(99).optional(),
  bio: z.string().max(500).optional(),
  job: z.string().max(80).nullable().optional(),
  studies: z.string().max(80).nullable().optional(),
  interests: z.array(z.string().max(40)).max(20).optional(),
});

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().max(80).optional(),
  zone: z.string().max(80).optional(),
});

export const reorderPhotosSchema = z.object({ ids: z.array(z.string()).min(1) });

export const pushTokenSchema = z.object({
  token: z.string().min(8),
  platform: z.enum(["IOS", "ANDROID"]),
});
