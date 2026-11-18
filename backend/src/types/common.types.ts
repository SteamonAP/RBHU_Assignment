export interface ApiResponse<T = unknown> {
  success: boolean; message: string; data?: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
  errors?: { field: string; message: string }[];
}
