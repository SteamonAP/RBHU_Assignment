import { Request, Response, NextFunction } from "express";
import { shipmentService } from "./shipment.service";
import { ShipmentListQuery } from "./shipment.validation";
export const shipmentController = {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query: ShipmentListQuery = res.locals.validatedQuery;
      const { data, total } = await shipmentService.getShipments(query);
      res.json({
        success: true,
        message: "Shipments retrieved",
        data,
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    } catch (e) {
      next(e);
    }
  },
  async getById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      res.json({
        success: true,
        message: "Shipment retrieved",
        data: await shipmentService.getShipmentById(req.params.id),
      });
    } catch (e) {
      next(e);
    }
  },
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res
        .status(201)
        .json({
          success: true,
          message: "Shipment created",
          data: await shipmentService.createShipment(req.body),
        });
    } catch (e) {
      next(e);
    }
  },
  async updateStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      res.json({
        success: true,
        message: "Status updated",
        data: await shipmentService.updateShipmentStatus(
          req.params.id,
          req.body,
        ),
      });
    } catch (e) {
      next(e);
    }
  },
};
