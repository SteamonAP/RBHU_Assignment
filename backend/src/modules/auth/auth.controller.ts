import { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service";
export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);
      res
        .status(200)
        .json({ success: true, message: "Login successful", data: result });
    } catch (e) {
      next(e);
    }
  },
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.me(req.user!.id);
      res.json({ success: true, message: "User retrieved", data: { user } });
    } catch (e) {
      next(e);
    }
  },
};
