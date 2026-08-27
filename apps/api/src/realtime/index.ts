import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { RealtimeEnvelope, RealtimeEventMap, RealtimeEventName } from '@flowdesk/shared';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { verifyAccessToken } from '../lib/tokens.js';

export const orgRoom = (orgId: string) => `org:${orgId}`;

let io: SocketIOServer | null = null;

interface SocketData {
  userId: string;
  orgId: string;
  role: string;
}

/**
 * Socket.IO server. The handshake carries the same access token the REST API
 * uses; the socket is then pinned to one room, `org:<orgId>`, which is the only
 * room the server ever broadcasts to. A client cannot join another tenant's
 * room because it never gets to choose the room name.
 */
export function createRealtimeServer(httpServer: HttpServer): SocketIOServer {
  const server = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    serveClient: false,
  });

  server.use((socket: Socket, next) => {
    try {
      const raw =
        (socket.handshake.auth as { token?: unknown } | undefined)?.token ??
        socket.handshake.query.token;
      const token = Array.isArray(raw) ? raw[0] : raw;
      if (typeof token !== 'string' || token.length === 0) {
        return next(new Error('UNAUTHENTICATED'));
      }
      const claims = verifyAccessToken(token);
      const data: SocketData = { userId: claims.sub, orgId: claims.orgId, role: claims.role };
      Object.assign(socket.data as SocketData, data);
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  server.on('connection', (socket) => {
    const data = socket.data as SocketData;
    void socket.join(orgRoom(data.orgId));
    logger.debug({ socketId: socket.id, orgId: data.orgId }, 'realtime client connected');

    socket.emit('connected', { orgId: data.orgId, userId: data.userId });

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'realtime client disconnected');
    });
  });

  io = server;
  return server;
}

export function setRealtimeServer(server: SocketIOServer | null): void {
  io = server;
}

/** Broadcasts an event to every connected member of one organization. */
export function emitToOrg<E extends RealtimeEventName>(
  orgId: string,
  event: E,
  payload: RealtimeEventMap[E],
): void {
  if (!io) return;
  const envelope: RealtimeEnvelope<E> = {
    event,
    orgId,
    payload,
    at: new Date().toISOString(),
  };
  io.to(orgRoom(orgId)).emit(event, envelope);
}

export async function closeRealtimeServer(): Promise<void> {
  if (!io) return;
  const server = io;
  io = null;
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}
