import { http } from '../lib/api';
import type { ApiResult } from '../lib/api';
import type { User } from '../types';

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResult = {
  user: User;
  accessToken: string;
};

export const authService = {
  login: (payload: LoginPayload): Promise<ApiResult<LoginResult>> =>
    http.post<LoginResult>('/auth/login', payload),

  me: (): Promise<ApiResult<{ user: User }>> =>
    http.get<{ user: User }>('/auth/me'),
};
