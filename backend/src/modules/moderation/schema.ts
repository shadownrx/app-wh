import { z } from "zod";

export const reportSchema = z.object({
  reason: z.enum([
    "FAKE_PROFILE",
    "INAPPROPRIATE",
    "HARASSMENT",
    "UNSOLICITED_SEXUAL",
    "POSSIBLE_MINOR",
    "SPAM_SCAM",
    "OTHER",
  ]),
  details: z.string().max(1000).optional(),
});
