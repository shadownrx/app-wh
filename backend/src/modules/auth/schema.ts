import { z } from "zod";
import { GENDERS } from "../../config/constants";

export const registerSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(100),
  dateOfBirth: z.string(),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  phone: z.string().min(8).max(20).optional(),
  name: z.string().min(1).max(40).optional(),
  gender: z.enum(GENDERS).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

export const resetRequestSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
});

export const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(100),
});

export const verifySchema = z.object({ token: z.string().min(10) });
