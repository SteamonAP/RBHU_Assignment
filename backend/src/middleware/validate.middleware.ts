import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { AppError } from "../errors/AppError";
const validationError = (error: ZodError): AppError =>
  new AppError(
    "Validation failed",
    422,
    error.errors.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  );

export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(validationError(error));
      }
      next(error);
    }
  };

export const validateQuery =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      res.locals.validatedQuery = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(validationError(error));
      }
      next(error);
    }
  };
