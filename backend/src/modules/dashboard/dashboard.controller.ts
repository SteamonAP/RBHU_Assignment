import { Request, Response, NextFunction } from "express";
import { dashboardService } from "./dashboard.service";
export const dashboardController = {
  async getSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      res.json({
        success: true,
        message: "Dashboard summary",
        data: await dashboardService.getSummary(),
      });
    } catch (e) {
      next(e);
    }
  },
};
