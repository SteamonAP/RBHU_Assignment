import axios from 'axios';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import type { ApiFieldError, ApiResponse, PaginationMeta } from '../types';

export const TOKEN_KEY = 'logiops_token';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1';

/** Unwrapped payload handed to the rest of the app by the response interceptor. */
export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
  message?: string;
}

/** Normalised, human readable API error. */
export class ApiError extends Error {
  status?: number;
  errors?: ApiFieldError[];

  constructor(message: string, status?: number, errors?: ApiFieldError[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse<unknown>;
    if (payload && typeof payload === 'object' && 'success' in payload) {
      return {
        data: payload.data,
        meta: payload.meta,
        message: payload.message,
      } as unknown as typeof response;
    }
    return response;
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    const body = error.response?.data;
    const message =
      (typeof body === 'object' && body?.message) ||
      (typeof body === 'object' && body?.errors?.[0]?.message) ||
      error.message ||
      'Something went wrong';

    return Promise.reject(new ApiError(message, status, body?.errors));
  },
);

function request<T>(config: AxiosRequestConfig): Promise<ApiResult<T>> {
  return api.request(config) as unknown as Promise<ApiResult<T>>;
}

export const http = {
  get: <T>(url: string, params?: object) =>
    request<T>({ method: 'GET', url, params }),
  post: <T>(url: string, body?: unknown) =>
    request<T>({ method: 'POST', url, data: body }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>({ method: 'PATCH', url, data: body }),
  delete: <T>(url: string) => request<T>({ method: 'DELETE', url }),
};

export default api;
