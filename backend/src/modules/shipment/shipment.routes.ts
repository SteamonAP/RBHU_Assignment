import { Router } from "express";
import { shipmentController } from "./shipment.controller";
import { validate, validateQuery } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";
import {
  createShipmentSchema,
  shipmentListQuerySchema,
  updateShipmentStatusSchema,
} from "./shipment.validation";
const router = Router();
router.use(authenticate);
router.get(
  "/",
  validateQuery(shipmentListQuerySchema),
  shipmentController.getAll,
);
router.get("/:id", shipmentController.getById);
router.post("/", validate(createShipmentSchema), shipmentController.create);
router.patch(
  "/:id/status",
  validate(updateShipmentStatusSchema),
  shipmentController.updateStatus,
);
export default router;
