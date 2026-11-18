import { shipmentRepository } from "./shipment.repository";
import { AppError } from "../../errors/AppError";
import { getIO } from "../../infrastructure/websocket/socket.server";
import {
  CreateShipmentDto,
  ShipmentListQuery,
  UpdateShipmentStatusDto,
} from "./shipment.validation";
export const shipmentService = {
  async getShipments(query: ShipmentListQuery) {
    const { page, limit } = query;
    return shipmentRepository.findAll({
      page,
      limit,
      search: query.search,
      status: query.status,
      customerId: query.customerId,
    });
  },
  async getShipmentById(id: string) {
    const s = await shipmentRepository.findById(id);
    if (!s) throw new AppError("Shipment not found", 404);
    return s;
  },
  async createShipment(dto: CreateShipmentDto) {
    const customer = await shipmentRepository.findActiveCustomer(
      dto.customerId,
    );
    if (!customer) throw new AppError("Customer not found", 404);
    return shipmentRepository.create(dto);
  },
  async updateShipmentStatus(id: string, dto: UpdateShipmentStatusDto) {
    const existing = await shipmentRepository.findById(id);
    if (!existing) throw new AppError("Shipment not found", 404);
    const previousStatus = existing.status;
    const updated = await shipmentRepository.updateStatus(id, dto.status);
    try {
      const io = getIO();
      io.emit("shipment_status_changed", {
        event: "shipment_status_changed",
        shipmentId: updated.id,
        trackingNumber: updated.trackingNumber,
        previousStatus,
        status: updated.status,
        updatedAt: updated.updatedAt,
      });
    } catch {
      /* socket not ready */
    }
    return updated;
  },
};
