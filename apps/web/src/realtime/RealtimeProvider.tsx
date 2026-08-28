import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { REALTIME_EVENTS } from '@flowdesk/shared';
import type { RealtimeEnvelope, TicketDetailDto } from '@flowdesk/shared';
import { useAuth } from '../auth/AuthContext';
import { queryKeys } from '../lib/queryClient';
import { upsertComment } from '../lib/comments';

interface RealtimeState {
  connected: boolean;
  lastEventAt: number | null;
}

const RealtimeContext = createContext<RealtimeState>({ connected: false, lastEventAt: null });

/**
 * Live updates.
 *
 * The socket carries the same access token as the REST API. Server-side each
 * socket is pinned to its organization's room, so everything that arrives here
 * already belongs to the current tenant. Ticket payloads are written straight
 * into the TanStack Query cache (so an open detail page updates in place) and
 * the list query is invalidated, which is what makes a second browser reflect
 * a change without a refresh.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { accessToken, status } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<RealtimeState>({ connected: false, lastEventAt: null });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setState({ connected: false, lastEventAt: null });
      return;
    }

    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token: accessToken },
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
    });
    socketRef.current = socket;

    const touch = () => {
      setState((prev) => ({ ...prev, lastEventAt: Date.now() }));
    };

    socket.on('connect', () => {
      setState((prev) => ({ ...prev, connected: true }));
    });
    socket.on('disconnect', () => {
      setState((prev) => ({ ...prev, connected: false }));
    });

    socket.on(REALTIME_EVENTS.ticketCreated, () => {
      touch();
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
    });

    socket.on(REALTIME_EVENTS.ticketUpdated, (envelope: RealtimeEnvelope<'ticket:updated'>) => {
      touch();
      const { ticket } = envelope.payload;
      // Patch the open detail view in place so the change lands without a refetch.
      queryClient.setQueryData<TicketDetailDto>(queryKeys.ticket(ticket.id), (previous) =>
        previous ? { ...previous, ...ticket } : previous,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
    });

    socket.on(REALTIME_EVENTS.ticketDeleted, (envelope: RealtimeEnvelope<'ticket:deleted'>) => {
      touch();
      queryClient.removeQueries({ queryKey: queryKeys.ticket(envelope.payload.ticketId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
    });

    socket.on(REALTIME_EVENTS.commentCreated, (envelope: RealtimeEnvelope<'comment:created'>) => {
      touch();
      const { comment, ticketId } = envelope.payload;
      queryClient.setQueryData<TicketDetailDto>(queryKeys.ticket(ticketId), (previous) => {
        if (!previous) return previous;
        const comments = upsertComment(previous.comments, comment);
        if (comments === previous.comments) return previous;
        return { ...previous, comments, commentCount: comments.length };
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
    });

    socket.on(REALTIME_EVENTS.slaBreached, (envelope: RealtimeEnvelope<'ticket:sla_breached'>) => {
      touch();
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(envelope.payload.ticketId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, status, queryClient]);

  const value = useMemo(() => state, [state]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}
