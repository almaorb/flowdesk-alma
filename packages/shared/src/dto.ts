import type { AuditAction, Priority, Role, TicketStatus } from './enums.js';

/** Generic envelope for every paginated list endpoint. */
export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface UserDto {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

/** Minimal user shape embedded in tickets/comments. */
export interface UserRefDto {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface TagDto {
  id: string;
  name: string;
  color: string;
}

export interface AttachmentDto {
  id: string;
  ticketId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string | null;
  uploadedBy: UserRefDto | null;
  createdAt: string;
}

export interface CommentDto {
  id: string;
  ticketId: string;
  parentId: string | null;
  body: string;
  isInternal: boolean;
  author: UserRefDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDto {
  id: string;
  orgId: string;
  number: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  customer: UserRefDto | null;
  assignee: UserRefDto | null;
  tags: TagDto[];
  commentCount: number;
  attachmentCount: number;
  firstResponseAt: string | null;
  slaDeadline: string;
  slaBreached: boolean;
  slaBreachedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface TicketDetailDto extends TicketDto {
  comments: CommentDto[];
  attachments: AttachmentDto[];
}

export interface InviteDto {
  id: string;
  email: string;
  role: Role;
  token: string;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
  invitedBy: UserRefDto | null;
}

/** Public (unauthenticated) view of an invite, used by the accept page. */
export interface PublicInviteDto {
  email: string;
  role: Role;
  organizationName: string;
  expiresAt: string;
}

export interface AuditLogDto {
  id: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string | null;
  actor: UserRefDto | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthSessionDto extends AuthTokens {
  user: UserDto;
  organization: OrganizationDto;
}

/* ----------------------------------------------------------- analytics -- */

export interface AnalyticsOverviewDto {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  breachedTickets: number;
  breachRate: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionHours: number | null;
}

export interface TicketsPerDayPointDto {
  date: string;
  created: number;
  resolved: number;
}

export interface AgentResponseStatDto {
  agentId: string;
  agentName: string;
  ticketsAnswered: number;
  avgFirstResponseMinutes: number;
  medianFirstResponseMinutes: number;
}

export interface BreachRateByPriorityDto {
  priority: Priority;
  total: number;
  breached: number;
  breachRate: number;
}

/* ------------------------------------------------------------ realtime -- */

export const REALTIME_EVENTS = {
  ticketCreated: 'ticket:created',
  ticketUpdated: 'ticket:updated',
  ticketDeleted: 'ticket:deleted',
  commentCreated: 'comment:created',
  slaBreached: 'ticket:sla_breached',
} as const;

export type RealtimeEventName = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export interface RealtimeEventMap {
  'ticket:created': { ticket: TicketDto; actorId: string | null };
  'ticket:updated': { ticket: TicketDto; actorId: string | null; changed: string[] };
  'ticket:deleted': { ticketId: string; actorId: string | null };
  'comment:created': { comment: CommentDto; ticketId: string; actorId: string | null };
  'ticket:sla_breached': { ticketId: string; ticketNumber: number; breachedAt: string };
}

export type RealtimeEnvelope<E extends RealtimeEventName = RealtimeEventName> = {
  event: E;
  orgId: string;
  payload: RealtimeEventMap[E];
  at: string;
};
