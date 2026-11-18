import axios from 'axios';
import type { AnalyticsData, AnalyticsResponse } from '../types';

export const ANALYTICS_BASE_URL =
  import.meta.env.VITE_ANALYTICS_API_URL ?? 'http://localhost:5001';

const analyticsClient = axios.create({ baseURL: ANALYTICS_BASE_URL });

export const analyticsService = {
  /**
   * Uploads a CSV file to the Python analytics service and returns the
   * structured analytics payload.
   */
  async analyze(file: File): Promise<AnalyticsData> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await analyticsClient.post<AnalyticsResponse>(
      '/analyze',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );

    const body = response.data;
    if (!body.success || !body.data) {
      const detail = body.errors
        ?.map((item) => item.message)
        .filter(Boolean)
        .join(', ');
      throw new Error(detail || body.message || 'Analytics request failed');
    }

    return body.data;
  },
};
