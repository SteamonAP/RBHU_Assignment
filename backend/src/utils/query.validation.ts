import { z } from "zod";

const positiveIntegerQuery = z
  .string()
  .regex(/^[1-9]\d*$/, "Must be a positive integer")
  .transform(Number)
  .refine(Number.isSafeInteger, "Must be a safe integer");

export const paginationQuerySchema = z.object({
  page: positiveIntegerQuery.default("1"),
  limit: positiveIntegerQuery
    .pipe(z.number().max(100, "Must be at most 100"))
    .default("10"),
});
