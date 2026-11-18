import { z } from "zod";
import { paginationQuerySchema } from "../../utils/query.validation";
export const createShipmentSchema = z.object({
  trackingNumber: z.string().min(3).max(50),
  customerId: z.string().min(1),
  origin: z.string().min(2).max(100),
  destination: z.string().min(2).max(100),
  status: z
    .enum(["Pending", "PickedUp", "InTransit", "Delivered", "Cancelled"])
    .default("Pending"),
});
export const updateShipmentStatusSchema = z.object({
  status: z.enum([
    "Pending",
    "PickedUp",
    "InTransit",
    "Delivered",
    "Cancelled",
  ]),
});
export const shipmentListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: z
    .enum(["Pending", "PickedUp", "InTransit", "Delivered", "Cancelled"])
    .optional(),
  customerId: z.string().min(1).optional(),
});
export type CreateShipmentDto = z.infer<typeof createShipmentSchema>;
export type UpdateShipmentStatusDto = z.infer<
  typeof updateShipmentStatusSchema
>;
export type ShipmentListQuery = z.infer<typeof shipmentListQuerySchema>;
