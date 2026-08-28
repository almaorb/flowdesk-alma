import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentResponseStatDto,
  AnalyticsOverviewDto,
  AuditLogDto,
  BreachRateByPriorityDto,
  CommentDto,
  CreateCommentInput,
  CreateTicketInput,
  InviteDto,
  Paginated,
  TagDto,
  TicketDetailDto,
  TicketDto,
  TicketStatus,
  TicketsPerDayPointDto,
  UpdateTicketInput,
  UserDto,
} from '@flowdesk/shared';
import { api } from '../lib/api';
import { upsertComment } from '../lib/comments';
import { queryKeys } from '../lib/queryClient';
import { useAuth } from '../auth/AuthContext';

export type TicketFilters = {
  page: number;
  pageSize: number;
  status?: string;
  priority?: string;
  assigneeId?: string;
  tagId?: string;
  q?: string;
  slaBreached?: string;
  sort: string;
  order: string;
};

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: queryKeys.tickets(filters),
    queryFn: () => api.get<Paginated<TicketDto>>('/tickets', { query: filters }),
    placeholderData: (previous) => previous,
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ticket(id ?? ''),
    queryFn: () => api.get<TicketDetailDto>(`/tickets/${id!}`),
    enabled: Boolean(id),
  });
}

export function useUsers(role?: string) {
  return useQuery({
    queryKey: queryKeys.users({ role }),
    queryFn: () => api.get<Paginated<UserDto>>('/users', { query: { role, pageSize: 200 } }),
    staleTime: 60_000,
  });
}

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: () => api.get<{ data: TagDto[] }>('/tags').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => api.post<TicketDto>('/tickets', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll }),
  });
}

export function useUpdateTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTicketInput) => api.patch<TicketDto>(`/tickets/${ticketId}`, input),
    /**
     * Optimistic update: the detail view reflects the change immediately and
     * rolls back to the snapshot if the API rejects it.
     */
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.ticket(ticketId) });
      const previous = queryClient.getQueryData<TicketDetailDto>(queryKeys.ticket(ticketId));
      if (previous) {
        queryClient.setQueryData<TicketDetailDto>(queryKeys.ticket(ticketId), {
          ...previous,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.ticket(ticketId), context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
    },
  });
}

export function useTransitionTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: TicketStatus; note?: string }) =>
      api.post<TicketDto>(`/tickets/${ticketId}/transition`, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.ticket(ticketId) });
      const previous = queryClient.getQueryData<TicketDetailDto>(queryKeys.ticket(ticketId));
      if (previous) {
        queryClient.setQueryData<TicketDetailDto>(queryKeys.ticket(ticketId), {
          ...previous,
          status: input.status,
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.ticket(ticketId), context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
    },
  });
}

export function useCreateComment(ticketId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api.post<CommentDto>(`/tickets/${ticketId}/comments`, input),
    /** The comment appears instantly, tagged as pending until the server confirms. */
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.ticket(ticketId) });
      const previous = queryClient.getQueryData<TicketDetailDto>(queryKeys.ticket(ticketId));
      const optimisticId = `optimistic-${Date.now()}`;

      if (previous && user) {
        const optimistic: CommentDto = {
          id: optimisticId,
          ticketId,
          parentId: input.parentId ?? null,
          body: input.body,
          isInternal: input.isInternal ?? false,
          author: { id: user.id, name: user.name, email: user.email, role: user.role },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        queryClient.setQueryData<TicketDetailDto>(queryKeys.ticket(ticketId), {
          ...previous,
          comments: [...previous.comments, optimistic],
          commentCount: previous.commentCount + 1,
        });
      }

      return { previous, optimisticId };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.ticket(ticketId), context.previous);
    },
    onSuccess: (created, _input, context) => {
      queryClient.setQueryData<TicketDetailDto>(queryKeys.ticket(ticketId), (current) => {
        if (!current) return current;
        const comments = upsertComment(current.comments, created, context?.optimisticId);
        return { ...current, comments, commentCount: comments.length };
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => api.delete<void>(`/tickets/${ticketId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll }),
  });
}

/* --------------------------------------------------------------- admin -- */

export function useInvites() {
  return useQuery({
    queryKey: queryKeys.invites,
    queryFn: () =>
      api.get<{ data: (InviteDto & { url: string })[] }>('/invites').then((r) => r.data),
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: string }) =>
      api.post<InviteDto & { url: string }>('/invites', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.invites }),
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/invites/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.invites }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; role?: string; isActive?: boolean }) =>
      api.patch<UserDto>(`/users/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useAuditLogs(filters: { page: number; pageSize: number; action?: string }) {
  return useQuery({
    queryKey: queryKeys.audit(filters),
    queryFn: () => api.get<Paginated<AuditLogDto>>('/audit-logs', { query: filters }),
    placeholderData: (previous) => previous,
  });
}

export function useAuditActions() {
  return useQuery({
    queryKey: queryKeys.auditActions,
    queryFn: () => api.get<{ data: string[] }>('/audit-logs/actions').then((r) => r.data),
    staleTime: 120_000,
  });
}

/* ----------------------------------------------------------- analytics -- */

export function useAnalytics(days: number) {
  const overview = useQuery({
    queryKey: queryKeys.analytics('overview', days),
    queryFn: () => api.get<AnalyticsOverviewDto>('/analytics/overview', { query: { days } }),
  });

  const perDay = useQuery({
    queryKey: queryKeys.analytics('tickets-per-day', days),
    queryFn: () =>
      api
        .get<{ data: TicketsPerDayPointDto[] }>('/analytics/tickets-per-day', { query: { days } })
        .then((r) => r.data),
  });

  const firstResponse = useQuery({
    queryKey: queryKeys.analytics('first-response', days),
    queryFn: () =>
      api
        .get<{ data: AgentResponseStatDto[] }>('/analytics/first-response', { query: { days } })
        .then((r) => r.data),
  });

  const breachRate = useQuery({
    queryKey: queryKeys.analytics('breach-rate', days),
    queryFn: () =>
      api
        .get<{ data: BreachRateByPriorityDto[] }>('/analytics/breach-rate', { query: { days } })
        .then((r) => r.data),
  });

  return { overview, perDay, firstResponse, breachRate };
}
