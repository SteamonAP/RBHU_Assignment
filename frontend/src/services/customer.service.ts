import { http } from '../lib/api';
import type { ApiResult } from '../lib/api';
import type { Customer, CustomerStatus } from '../types';

export type CustomerQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
};

export type CustomerPayload = {
  name: string;
  email: string;
  company: string;
  status: CustomerStatus;
};

export const customerService = {
  list: (params: CustomerQuery): Promise<ApiResult<Customer[]>> =>
    http.get<Customer[]>('/customers', params),

  get: (id: string): Promise<ApiResult<Customer>> =>
    http.get<Customer>(`/customers/${id}`),

  create: (payload: CustomerPayload): Promise<ApiResult<Customer>> =>
    http.post<Customer>('/customers', payload),

  update: (
    id: string,
    payload: Partial<CustomerPayload>,
  ): Promise<ApiResult<Customer>> =>
    http.patch<Customer>(`/customers/${id}`, payload),

  remove: (id: string): Promise<ApiResult<undefined>> =>
    http.delete<undefined>(`/customers/${id}`),
};
