import { http } from '../lib/api';
import type { ApiResult } from '../lib/api';
import type { DashboardSummary } from '../types';

export const dashboardService = {
  summary: (): Promise<ApiResult<DashboardSummary>> =>
    http.get<DashboardSummary>('/dashboard/summary'),
};
