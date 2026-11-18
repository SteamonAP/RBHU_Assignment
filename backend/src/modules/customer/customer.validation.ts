import { z } from "zod";
import { paginationQuerySchema } from "../../utils/query.validation";
export const createCustomerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  company: z.string().min(2).max(150),
  status: z.enum(["Active", "Inactive"]).default("Active"),
});
export const updateCustomerSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  company: z.string().min(2).max(150).optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
});
export const customerListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["Active", "Inactive"]).optional(),
  ),
});
export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
