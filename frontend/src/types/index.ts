/**
 * Shared domain + API types for the LogiOps frontend.
 */

export type CustomerStatus = 'Active' | 'Inactive';

export type ShipmentStatus =
  | 'Pending'
  | 'PickedUp'
  | 'InTransit'
  | 'Delivered'
  | 'Cancelled';

export type ChatRole = 'user' | 'assistant';

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: PaginationMeta;
  errors?: ApiFieldError[];
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentCustomer {
  id: string;
  name: string;
  company: string;
}

export interface Shipment {
  id: string;
  trackingNumber: string;
  customerId: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  createdAt: string;
  updatedAt: string;
  customer?: ShipmentCustomer;
}

export interface DashboardSummary {
  totalCustomers: number;
  totalShipments: number;
  shipmentStatusDistribution: Record<ShipmentStatus, number>;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  title?: string;
  lastMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShipmentStatusChangedEvent {
  event: string;
  shipmentId: string;
  trackingNumber: string;
  previousStatus: ShipmentStatus;
  status: ShipmentStatus;
  updatedAt: string;
}

export interface AnalyticsSummary {
  totalRevenue: number;
  averageRevenue: number;
  highestSale: number;
  lowestSale: number;
  totalRecords: number;
  uniqueSalespeople: number;
  uniqueRegions: number;
}

export interface RegionRevenue {
  region: string;
  totalRevenue: number;
}

export interface SalespersonRevenue {
  salesperson: string;
  totalRevenue: number;
}

export interface AnalyticsCharts {
  revenueByRegion: Record<string, unknown>;
  topSalespeople: Record<string, unknown>;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  revenueByRegion: RegionRevenue[];
  topSalespeople: SalespersonRevenue[];
  charts?: AnalyticsCharts;
}

export interface AnalyticsResponse {
  success: boolean;
  message?: string;
  data?: AnalyticsData;
  errors?: ApiFieldError[];
}
