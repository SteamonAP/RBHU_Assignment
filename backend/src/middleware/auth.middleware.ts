import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.config";
import { AppError } from "../errors/AppError";
import prisma from "../infrastructure/prisma/prisma.client";
interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      throw new AppError("Authentication required. Please login.", 401);
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw new AppError("User no longer exists.", 401);
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError)
      return next(new AppError("Token expired.", 401));
    if (error instanceof jwt.JsonWebTokenError)
      return next(new AppError("Invalid token.", 401));
    next(error);
  }
};
export const authorize =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role))
      return next(new AppError("Forbidden.", 403));
    next();
  };
