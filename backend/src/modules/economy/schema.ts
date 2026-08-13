import { z } from "zod";

export const purchaseSchema = z.object({
  key: z.string(),
  targetId: z.string().optional(),
});
