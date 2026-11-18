import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import logger from "../utils/logger";
import { env } from "../config/env.config";
export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json({
        success: false,
        message: err.message,
        ...(err.errors && { errors: err.errors }),
      });
    return;
  }
  if ((err as any).code === "P2002") {
    const field = (err as any).meta?.target?.[0] || "field";
    res
      .status(409)
      .json({ success: false, message: `Duplicate ${field} value.` });
    return;
  }
  logger.error("Unhandled error:", err);
  res
    .status(500)
    .json({
      success: false,
      message:
        env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
};
export const notFoundHandler = (req: Request, res: Response): void => {
  res
    .status(404)
    .json({ success: false, message: `Route ${req.originalUrl} not found` });
};
