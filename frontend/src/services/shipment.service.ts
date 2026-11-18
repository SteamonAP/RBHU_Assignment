import { http } from '../lib/api';
import type { ApiResult } from '../lib/api';
import type { Shipment, ShipmentStatus } from '../types';

export type ShipmentQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  customerId?: string;
};

export type ShipmentPayload = {
  trackingNumber: string;
  customerId: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
};

export const shipmentService = {
  list: (params: ShipmentQuery): Promise<ApiResult<Shipment[]>> =>
    http.get<Shipment[]>('/shipments', params),

  get: (id: string): Promise<ApiResult<Shipment>> =>
    http.get<Shipment>(`/shipments/${id}`),

  create: (payload: ShipmentPayload): Promise<ApiResult<Shipment>> =>
    http.post<Shipment>('/shipments', payload),

  updateStatus: (
    id: string,
    status: ShipmentStatus,
  ): Promise<ApiResult<Shipment>> =>
    http.patch<Shipment>(`/shipments/${id}/status`, { status }),
};
