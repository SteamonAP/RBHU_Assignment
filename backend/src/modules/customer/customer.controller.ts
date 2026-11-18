import { Request, Response, NextFunction } from "express";
import { customerService } from "./customer.service";
import { CustomerListQuery } from "./customer.validation";
export const customerController = {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query: CustomerListQuery = res.locals.validatedQuery;
      const { data, total } = await customerService.getCustomers(query);
      res.json({
        success: true,
        message: "Customers retrieved",
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
        message: "Customer retrieved",
        data: await customerService.getCustomerById(req.params.id),
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
          message: "Customer created",
          data: await customerService.createCustomer(req.body),
        });
    } catch (e) {
      next(e);
    }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({
        success: true,
        message: "Customer updated",
        data: await customerService.updateCustomer(req.params.id, req.body),
      });
    } catch (e) {
      next(e);
    }
  },
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await customerService.deleteCustomer(req.params.id);
      res.json({ success: true, message: "Customer deleted" });
    } catch (e) {
      next(e);
    }
  },
};
