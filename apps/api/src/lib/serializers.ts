import type { Prisma } from '@prisma/client';
import type {
  AttachmentDto,
  AuditLogDto,
  CommentDto,
  InviteDto,
  OrganizationDto,
  PublicInviteDto,
  TagDto,
  TicketDetailDto,
  TicketDto,
  UserDto,
  UserRefDto,
} from '@flowdesk/shared';

export const userRefSelect = { id: true, name: true, email: true, role: true } as const;

export const userSelect = {
  id: true,
  orgId: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export const tagSelect = { id: true, name: true, color: true } as const;

export const commentSelect = {
  id: true,
  ticketId: true,
  parentId: true,
  body: true,
  isInternal: true,
  createdAt: true,
  updatedAt: true,
  author: { select: userRefSelect },
} as const;

export const attachmentSelect = {
  id: true,
  ticketId: true,
  filename: true,
  contentType: true,
  sizeBytes: true,
  url: true,
  createdAt: true,
  uploadedBy: { select: userRefSelect },
} as const;

export const ticketSelect = {
  id: true,
  orgId: true,
  number: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  firstResponseAt: true,
  slaDeadline: true,
  slaBreached: true,
  slaBreachedAt: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: userRefSelect },
  assignee: { select: userRefSelect },
  tags: { select: { tag: { select: tagSelect } } },
  _count: { select: { comments: true, attachments: true } },
} as const;

type UserRefRow = Prisma.UserGetPayload<{ select: typeof userRefSelect }>;
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
type TicketRow = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;
type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;
type AttachmentRow = Prisma.AttachmentGetPayload<{ select: typeof attachmentSelect }>;

const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

export function toUserRef(row: UserRefRow | null | undefined): UserRefDto | null {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toOrganizationDto(row: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}): OrganizationDto {
  return { id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt.toISOString() };
}

export function toTagDto(row: { id: string; name: string; color: string }): TagDto {
  return { id: row.id, name: row.name, color: row.color };
}

export function toTicketDto(row: TicketRow): TicketDto {
  return {
    id: row.id,
    orgId: row.orgId,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    customer: toUserRef(row.customer),
    assignee: toUserRef(row.assignee),
    tags: row.tags.map((link) => toTagDto(link.tag)),
    commentCount: row._count.comments,
    attachmentCount: row._count.attachments,
    firstResponseAt: iso(row.firstResponseAt),
    slaDeadline: row.slaDeadline.toISOString(),
    slaBreached: row.slaBreached,
    slaBreachedAt: iso(row.slaBreachedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
  };
}

export function toCommentDto(row: CommentRow): CommentDto {
  return {
    id: row.id,
    ticketId: row.ticketId,
    parentId: row.parentId,
    body: row.body,
    isInternal: row.isInternal,
    author: toUserRef(row.author),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAttachmentDto(row: AttachmentRow): AttachmentDto {
  return {
    id: row.id,
    ticketId: row.ticketId,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    url: row.url,
    uploadedBy: toUserRef(row.uploadedBy),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTicketDetailDto(
  ticket: TicketRow,
  comments: CommentRow[],
  attachments: AttachmentRow[],
): TicketDetailDto {
  return {
    ...toTicketDto(ticket),
    comments: comments.map(toCommentDto),
    attachments: attachments.map(toAttachmentDto),
  };
}

export function toInviteDto(row: {
  id: string;
  email: string;
  role: UserRefDto['role'];
  token: string;
  acceptedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  invitedBy?: UserRefRow | null;
}): InviteDto {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    token: row.token,
    acceptedAt: iso(row.acceptedAt),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    invitedBy: toUserRef(row.invitedBy),
  };
}

export function toPublicInviteDto(row: {
  email: string;
  role: UserRefDto['role'];
  expiresAt: Date;
  organization: { name: string };
}): PublicInviteDto {
  return {
    email: row.email,
    role: row.role,
    organizationName: row.organization.name,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export function toAuditLogDto(row: {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Prisma.JsonValue | null;
  ip: string | null;
  createdAt: Date;
  actor?: UserRefRow | null;
}): AuditLogDto {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actor: toUserRef(row.actor),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  };
}
