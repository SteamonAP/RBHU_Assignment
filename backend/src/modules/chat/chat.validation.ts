import { z } from "zod";
export const sendMessageSchema = z.object({
  conversationId: z.string().nullable().default(null),
  message: z.string().min(1).max(2000),
});
