import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { corsOrigins, env } from "./config/env.config";
import {
  globalErrorHandler,
  notFoundHandler,
} from "./middleware/error.middleware";
import authRoutes from "./modules/auth/auth.routes";
import customerRoutes from "./modules/customer/customer.routes";
import shipmentRoutes from "./modules/shipment/shipment.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import chatRoutes from "./modules/chat/chat.routes";
const app = express();
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(
  "/api/",
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    message: { success: false, message: "Too many requests." },
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.get("/health", (req, res) =>
  res.json({ success: true, message: "LogiOps API running", version: "1.0.0" }),
);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/shipments", shipmentRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use(notFoundHandler);
app.use(globalErrorHandler);
export default app;
