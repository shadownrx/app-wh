import { z } from "zod";

export const swipeSchema = z.object({
  targetId: z.string().uuid(),
  action: z.enum(["LIKE", "PASS", "SUPER_INVITE"]),
});
