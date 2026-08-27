import { z } from 'zod';
import { PRIORITIES, ROLES, TICKET_STATUSES } from './enums.js';

export const emailSchema = z.string().trim().toLowerCase().email('Must be a valid email address');

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200, 'Password must be at most 200 characters');

export const cuidLike = z.string().min(1).max(64);

/* ------------------------------------------------------------------ auth -- */

export const signupSchema = z.object({
  organizationName: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(1).max(80),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const createInviteSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

/* --------------------------------------------------------------- tickets -- */

export const createTicketSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().trim().min(1, 'Description is required').max(20_000),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  assigneeId: cuidLike.nullish(),
  /** Admins/agents may file a ticket on behalf of a customer. */
  customerId: cuidLike.nullish(),
  tagIds: z.array(cuidLike).max(20).optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().min(1).max(20_000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: cuidLike.nullable().optional(),
    tagIds: z.array(cuidLike).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const transitionTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  note: z.string().trim().max(1000).optional(),
});
export type TransitionTicketInput = z.infer<typeof transitionTicketSchema>;

const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.enum(values))])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const list = Array.isArray(value) ? value : value.split(',');
      const cleaned = list.map((v) => v.trim()).filter(Boolean);
      return cleaned.length > 0 ? cleaned : undefined;
    })
    .pipe(z.array(z.enum(values)).nonempty().optional());

export const TICKET_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'priority',
  'status',
  'title',
  'slaDeadline',
] as const;
export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: csv(TICKET_STATUSES),
  priority: csv(PRIORITIES),
  assigneeId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  tagId: z.string().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  slaBreached: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(TICKET_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

/* -------------------------------------------------------------- comments -- */

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(20_000),
  /** Internal notes are hidden from CUSTOMER users. */
  isInternal: z.boolean().default(false),
  parentId: cuidLike.nullish(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/* ------------------------------------------------------------------ tags -- */

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #2563eb')
    .default('#2563eb'),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

/* ----------------------------------------------------------- attachments -- */

export const createAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.coerce.number().int().min(0).max(50 * 1024 * 1024),
  url: z.string().url().max(2048).optional(),
});
export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;

/* ----------------------------------------------------------------- users -- */

export const updateUserSchema = z.object({
  role: z.enum(ROLES).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/* ------------------------------------------------------- audit/analytics -- */

export const listAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().trim().max(60).optional(),
  actorId: z.string().min(1).optional(),
  entityType: z.string().trim().max(40).optional(),
});

export const analyticsRangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
