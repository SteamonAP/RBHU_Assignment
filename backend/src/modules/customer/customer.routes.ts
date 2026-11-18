import { Router } from "express";
import { customerController } from "./customer.controller";
import { validate, validateQuery } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";
import {
  createCustomerSchema,
  customerListQuerySchema,
  updateCustomerSchema,
} from "./customer.validation";
const router = Router();
router.use(authenticate);
router.get(
  "/",
  validateQuery(customerListQuerySchema),
  customerController.getAll,
);
router.get("/:id", customerController.getById);
router.post("/", validate(createCustomerSchema), customerController.create);
router.patch("/:id", validate(updateCustomerSchema), customerController.update);
router.delete("/:id", customerController.remove);
export default router;
