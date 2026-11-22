const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiError(payload?.error?.message || `Request failed (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { data: T };
  return payload.data;
}

export async function restoreSession(): Promise<{ token: string; user: import('./types').User; tenant: import('./types').Tenant } | null> {
  try {
    const refreshed = await api<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
    const identity = await api<{ user: import('./types').User; tenant: import('./types').Tenant }>('/auth/me', {}, refreshed.accessToken);
    return { token: refreshed.accessToken, ...identity };
  } catch {
    return null;
  }
}
