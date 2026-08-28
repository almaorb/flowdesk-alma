import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Realtime pushes keep the cache fresh, so background polling is off.
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

export const queryKeys = {
  me: ['me'] as const,
  tickets: (filters: Record<string, unknown>) => ['tickets', filters] as const,
  ticketsAll: ['tickets'] as const,
  ticket: (id: string) => ['ticket', id] as const,
  users: (filters: Record<string, unknown> = {}) => ['users', filters] as const,
  tags: ['tags'] as const,
  invites: ['invites'] as const,
  analytics: (name: string, days: number) => ['analytics', name, days] as const,
  audit: (filters: Record<string, unknown>) => ['audit', filters] as const,
  auditActions: ['audit', 'actions'] as const,
};
