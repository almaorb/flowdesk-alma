import {
  ERROR_CODES,
  PRIORITIES,
  ROLES,
  TICKET_SORT_FIELDS,
  TICKET_STATUSES,
} from '@flowdesk/shared';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('Error') } },
});

const paginatedOf = (name: string) => ({
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: ref(name) },
    meta: ref('PageMeta'),
  },
});

const queryParam = (
  name: string,
  schema: Record<string, unknown>,
  description: string,
  location: 'query' | 'path' = 'query',
) => ({
  name,
  in: location,
  required: location === 'path',
  schema,
  description,
});

/**
 * Hand-written OpenAPI 3.1 document. It is kept next to the routes and asserted
 * against the live router in the test-suite, so a route added without docs
 * fails CI rather than silently drifting.
 */
export function buildOpenApiDocument(serverUrl = '/') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'FlowDesk API',
      version: '1.0.0',
      description:
        'Multi-tenant helpdesk API. Every authenticated request is scoped to the organization ' +
        'in the caller’s access token; ids belonging to another organization return 404.',
      license: { name: 'MIT' },
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'Auth', description: 'Signup, login, refresh, invites' },
      { name: 'Tickets', description: 'Ticket CRUD, transitions, comments, attachments' },
      { name: 'Users', description: 'Organization directory' },
      { name: 'Tags' },
      { name: 'Invites' },
      { name: 'Analytics', description: 'Admin-only SQL aggregations' },
      { name: 'Audit', description: 'Admin-only audit trail' },
      { name: 'System' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', enum: [...ERROR_CODES] },
                message: { type: 'string' },
                fields: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['path', 'message'],
                    properties: { path: { type: 'string' }, message: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
        PageMeta: {
          type: 'object',
          required: ['page', 'pageSize', 'total', 'totalPages', 'hasNextPage'],
          properties: {
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
          },
        },
        UserRef: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: [...ROLES] },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            orgId: { type: 'string' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { type: 'string', enum: [...ROLES] },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Organization: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Tag: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          },
        },
        Comment: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            ticketId: { type: 'string' },
            parentId: { type: ['string', 'null'] },
            body: { type: 'string' },
            isInternal: { type: 'boolean' },
            author: { oneOf: [ref('UserRef'), { type: 'null' }] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Attachment: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            ticketId: { type: 'string' },
            filename: { type: 'string' },
            contentType: { type: 'string' },
            sizeBytes: { type: 'integer' },
            url: { type: ['string', 'null'] },
            uploadedBy: { oneOf: [ref('UserRef'), { type: 'null' }] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Ticket: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            orgId: { type: 'string' },
            number: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: [...TICKET_STATUSES] },
            priority: { type: 'string', enum: [...PRIORITIES] },
            customer: { oneOf: [ref('UserRef'), { type: 'null' }] },
            assignee: { oneOf: [ref('UserRef'), { type: 'null' }] },
            tags: { type: 'array', items: ref('Tag') },
            commentCount: { type: 'integer' },
            attachmentCount: { type: 'integer' },
            firstResponseAt: { type: ['string', 'null'], format: 'date-time' },
            slaDeadline: { type: 'string', format: 'date-time' },
            slaBreached: { type: 'boolean' },
            slaBreachedAt: { type: ['string', 'null'], format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            resolvedAt: { type: ['string', 'null'], format: 'date-time' },
            closedAt: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        TicketDetail: {
          allOf: [
            ref('Ticket'),
            {
              type: 'object',
              properties: {
                comments: { type: 'array', items: ref('Comment') },
                attachments: { type: 'array', items: ref('Attachment') },
              },
            },
          ],
        },
        AuthSession: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'integer', description: 'Access token lifetime in seconds' },
            user: ref('User'),
            organization: ref('Organization'),
          },
        },
        Invite: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: [...ROLES] },
            token: { type: 'string' },
            url: { type: 'string' },
            acceptedAt: { type: ['string', 'null'], format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            invitedBy: { oneOf: [ref('UserRef'), { type: 'null' }] },
          },
        },
        PublicInvite: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: [...ROLES] },
            organizationName: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            action: { type: 'string' },
            entityType: { type: 'string' },
            entityId: { type: ['string', 'null'] },
            actor: { oneOf: [ref('UserRef'), { type: 'null' }] },
            metadata: { type: ['object', 'null'], additionalProperties: true },
            ip: { type: ['string', 'null'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AnalyticsOverview: {
          type: 'object',
          properties: {
            totalTickets: { type: 'integer' },
            openTickets: { type: 'integer' },
            resolvedTickets: { type: 'integer' },
            breachedTickets: { type: 'integer' },
            breachRate: { type: 'number' },
            avgFirstResponseMinutes: { type: ['number', 'null'] },
            avgResolutionHours: { type: ['number', 'null'] },
          },
        },
        TicketsPerDayPoint: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            created: { type: 'integer' },
            resolved: { type: 'integer' },
          },
        },
        AgentResponseStat: {
          type: 'object',
          properties: {
            agentId: { type: 'string' },
            agentName: { type: 'string' },
            ticketsAnswered: { type: 'integer' },
            avgFirstResponseMinutes: { type: 'number' },
            medianFirstResponseMinutes: { type: 'number' },
          },
        },
        BreachRateByPriority: {
          type: 'object',
          properties: {
            priority: { type: 'string', enum: [...PRIORITIES] },
            total: { type: 'integer' },
            breached: { type: 'integer' },
            breachRate: { type: 'number' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/health': {
        get: {
          tags: ['System'],
          summary: 'Liveness and database probe',
          security: [],
          responses: {
            200: { description: 'Service is healthy' },
            503: errorResponse('Database unreachable'),
          },
        },
      },
      '/api/auth/signup': {
        post: {
          tags: ['Auth'],
          summary: 'Create an organization and its first admin',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['organizationName', 'name', 'email', 'password'],
                  properties: {
                    organizationName: { type: 'string', minLength: 2, maxLength: 80 },
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 10 },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Session',
              content: { 'application/json': { schema: ref('AuthSession') } },
            },
            400: errorResponse('VALIDATION_ERROR'),
            409: errorResponse('EMAIL_TAKEN'),
            429: errorResponse('RATE_LIMITED'),
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Exchange credentials for an access + refresh token pair',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Session',
              content: { 'application/json': { schema: ref('AuthSession') } },
            },
            401: errorResponse('INVALID_CREDENTIALS'),
            429: errorResponse('RATE_LIMITED'),
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate a refresh token (single use)',
          security: [],
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { refreshToken: { type: 'string' } } },
              },
            },
          },
          responses: {
            200: {
              description: 'Session',
              content: { 'application/json': { schema: ref('AuthSession') } },
            },
            401: errorResponse('UNAUTHENTICATED'),
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Revoke the supplied refresh token',
          security: [],
          responses: { 204: { description: 'Logged out' } },
        },
      },
      '/api/auth/logout-all': {
        post: {
          tags: ['Auth'],
          summary: 'Revoke every session for the caller',
          responses: {
            204: { description: 'All sessions revoked' },
            401: errorResponse('UNAUTHENTICATED'),
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Current user and organization',
          responses: {
            200: {
              description: 'Identity',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { user: ref('User'), organization: ref('Organization') },
                  },
                },
              },
            },
            401: errorResponse('UNAUTHENTICATED'),
          },
        },
      },
      '/api/auth/accept-invite': {
        post: {
          tags: ['Auth'],
          summary: 'Create an account from an invite token',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'name', 'password'],
                  properties: {
                    token: { type: 'string' },
                    name: { type: 'string' },
                    password: { type: 'string', minLength: 10 },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Session',
              content: { 'application/json': { schema: ref('AuthSession') } },
            },
            400: errorResponse('INVITE_INVALID / INVITE_EXPIRED'),
            409: errorResponse('EMAIL_TAKEN'),
          },
        },
      },
      '/api/public/invites/{token}': {
        get: {
          tags: ['Auth'],
          summary: 'Look up an invite before accepting it',
          security: [],
          parameters: [queryParam('token', { type: 'string' }, 'Invite token', 'path')],
          responses: {
            200: {
              description: 'Invite',
              content: { 'application/json': { schema: ref('PublicInvite') } },
            },
            400: errorResponse('INVITE_INVALID / INVITE_EXPIRED'),
            404: errorResponse('INVITE_INVALID'),
          },
        },
      },
      '/api/tickets': {
        get: {
          tags: ['Tickets'],
          summary: 'List tickets (server-side filter, search, sort, paginate)',
          parameters: [
            queryParam('page', { type: 'integer', minimum: 1, default: 1 }, 'Page number'),
            queryParam(
              'pageSize',
              { type: 'integer', minimum: 1, maximum: 100, default: 20 },
              'Rows per page',
            ),
            queryParam(
              'status',
              { type: 'string' },
              `Comma-separated: ${TICKET_STATUSES.join(',')}`,
            ),
            queryParam('priority', { type: 'string' }, `Comma-separated: ${PRIORITIES.join(',')}`),
            queryParam('assigneeId', { type: 'string' }, 'User id, or "unassigned"'),
            queryParam('customerId', { type: 'string' }, 'Customer user id'),
            queryParam('tagId', { type: 'string' }, 'Tag id'),
            queryParam('q', { type: 'string' }, 'Free-text search over title and description'),
            queryParam('slaBreached', { type: 'string', enum: ['true', 'false'] }, 'Breach filter'),
            queryParam('sort', { type: 'string', enum: [...TICKET_SORT_FIELDS] }, 'Sort column'),
            queryParam('order', { type: 'string', enum: ['asc', 'desc'] }, 'Sort direction'),
          ],
          responses: {
            200: {
              description: 'Page of tickets',
              content: { 'application/json': { schema: paginatedOf('Ticket') } },
            },
            401: errorResponse('UNAUTHENTICATED'),
          },
        },
        post: {
          tags: ['Tickets'],
          summary: 'Create a ticket',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'description'],
                  properties: {
                    title: { type: 'string', minLength: 3, maxLength: 200 },
                    description: { type: 'string', minLength: 1 },
                    priority: { type: 'string', enum: [...PRIORITIES], default: 'MEDIUM' },
                    assigneeId: { type: ['string', 'null'] },
                    customerId: { type: ['string', 'null'] },
                    tagIds: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Created',
              content: { 'application/json': { schema: ref('Ticket') } },
            },
            400: errorResponse('VALIDATION_ERROR'),
            403: errorResponse('FORBIDDEN'),
          },
        },
      },
      '/api/tickets/{id}': {
        parameters: [queryParam('id', { type: 'string' }, 'Ticket id', 'path')],
        get: {
          tags: ['Tickets'],
          summary: 'Fetch one ticket with its thread',
          responses: {
            200: {
              description: 'Ticket',
              content: { 'application/json': { schema: ref('TicketDetail') } },
            },
            404: errorResponse('NOT_FOUND (also returned for another tenant’s ticket)'),
          },
        },
        patch: {
          tags: ['Tickets'],
          summary: 'Update ticket fields',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    priority: { type: 'string', enum: [...PRIORITIES] },
                    assigneeId: { type: ['string', 'null'] },
                    tagIds: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Updated',
              content: { 'application/json': { schema: ref('Ticket') } },
            },
            400: errorResponse('VALIDATION_ERROR'),
            403: errorResponse('FORBIDDEN'),
            404: errorResponse('NOT_FOUND'),
          },
        },
        delete: {
          tags: ['Tickets'],
          summary: 'Delete a ticket (ADMIN only)',
          responses: {
            204: { description: 'Deleted' },
            403: errorResponse('FORBIDDEN'),
            404: errorResponse('NOT_FOUND'),
          },
        },
      },
      '/api/tickets/{id}/transition': {
        parameters: [queryParam('id', { type: 'string' }, 'Ticket id', 'path')],
        post: {
          tags: ['Tickets'],
          summary: 'Move a ticket through the state machine',
          description:
            'Illegal edges return 409 INVALID_TRANSITION. Legal edges the caller is not entitled ' +
            'to (e.g. an agent reopening) return 403 FORBIDDEN_TRANSITION. Every accepted ' +
            'transition writes an AuditLog row.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: [...TICKET_STATUSES] },
                    note: { type: 'string', maxLength: 1000 },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Updated',
              content: { 'application/json': { schema: ref('Ticket') } },
            },
            403: errorResponse('FORBIDDEN_TRANSITION'),
            404: errorResponse('NOT_FOUND'),
            409: errorResponse('INVALID_TRANSITION'),
          },
        },
      },
      '/api/tickets/{id}/comments': {
        parameters: [queryParam('id', { type: 'string' }, 'Ticket id', 'path')],
        get: {
          tags: ['Tickets'],
          summary: 'List the ticket thread (internal notes hidden from customers)',
          responses: {
            200: {
              description: 'Comments',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'array', items: ref('Comment') } },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Tickets'],
          summary: 'Add a comment; the first public agent reply stops the SLA clock',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['body'],
                  properties: {
                    body: { type: 'string', minLength: 1 },
                    isInternal: { type: 'boolean', default: false },
                    parentId: { type: ['string', 'null'] },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Created',
              content: { 'application/json': { schema: ref('Comment') } },
            },
            400: errorResponse('VALIDATION_ERROR'),
            404: errorResponse('NOT_FOUND'),
          },
        },
      },
      '/api/tickets/{id}/attachments': {
        parameters: [queryParam('id', { type: 'string' }, 'Ticket id', 'path')],
        post: {
          tags: ['Tickets'],
          summary: 'Record attachment metadata (no bytes are stored)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['filename', 'contentType', 'sizeBytes'],
                  properties: {
                    filename: { type: 'string' },
                    contentType: { type: 'string' },
                    sizeBytes: { type: 'integer', minimum: 0 },
                    url: { type: 'string', format: 'uri' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Created',
              content: { 'application/json': { schema: ref('Attachment') } },
            },
            400: errorResponse('VALIDATION_ERROR'),
          },
        },
      },
      '/api/tickets/{id}/attachments/{childId}': {
        parameters: [
          queryParam('id', { type: 'string' }, 'Ticket id', 'path'),
          queryParam('childId', { type: 'string' }, 'Attachment id', 'path'),
        ],
        delete: {
          tags: ['Tickets'],
          summary: 'Remove attachment metadata (ADMIN/AGENT)',
          responses: { 204: { description: 'Deleted' }, 404: errorResponse('NOT_FOUND') },
        },
      },
      '/api/users': {
        get: {
          tags: ['Users'],
          summary: 'Organization directory (customers see only themselves)',
          parameters: [
            queryParam('role', { type: 'string', enum: [...ROLES] }, 'Filter by role'),
            queryParam('q', { type: 'string' }, 'Search name or email'),
            queryParam('page', { type: 'integer' }, 'Page number'),
            queryParam('pageSize', { type: 'integer' }, 'Rows per page'),
          ],
          responses: {
            200: {
              description: 'Page of users',
              content: { 'application/json': { schema: paginatedOf('User') } },
            },
          },
        },
      },
      '/api/users/{id}': {
        parameters: [queryParam('id', { type: 'string' }, 'User id', 'path')],
        get: {
          tags: ['Users'],
          summary: 'Fetch one user in the caller’s organization',
          responses: {
            200: { description: 'User', content: { 'application/json': { schema: ref('User') } } },
            404: errorResponse('NOT_FOUND'),
          },
        },
        patch: {
          tags: ['Users'],
          summary: 'Change a user’s role, name or active flag (ADMIN only)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    role: { type: 'string', enum: [...ROLES] },
                    isActive: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Updated',
              content: { 'application/json': { schema: ref('User') } },
            },
            400: errorResponse('VALIDATION_ERROR'),
            403: errorResponse('FORBIDDEN'),
          },
        },
      },
      '/api/tags': {
        get: {
          tags: ['Tags'],
          summary: 'List tags',
          responses: {
            200: {
              description: 'Tags',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'array', items: ref('Tag') } },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Tags'],
          summary: 'Create a tag (ADMIN/AGENT)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' }, color: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Created',
              content: { 'application/json': { schema: ref('Tag') } },
            },
            409: errorResponse('CONFLICT'),
          },
        },
      },
      '/api/tags/{id}': {
        parameters: [queryParam('id', { type: 'string' }, 'Tag id', 'path')],
        delete: {
          tags: ['Tags'],
          summary: 'Delete a tag (ADMIN only)',
          responses: { 204: { description: 'Deleted' }, 404: errorResponse('NOT_FOUND') },
        },
      },
      '/api/invites': {
        get: {
          tags: ['Invites'],
          summary: 'List pending invites (ADMIN only)',
          responses: {
            200: {
              description: 'Invites',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'array', items: ref('Invite') } },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Invites'],
          summary: 'Create a tokenized invite link (ADMIN only)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'role'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    role: { type: 'string', enum: [...ROLES] },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Created',
              content: { 'application/json': { schema: ref('Invite') } },
            },
            409: errorResponse('EMAIL_TAKEN / CONFLICT'),
          },
        },
      },
      '/api/invites/{id}': {
        parameters: [queryParam('id', { type: 'string' }, 'Invite id', 'path')],
        delete: {
          tags: ['Invites'],
          summary: 'Revoke an invite (ADMIN only)',
          responses: { 204: { description: 'Revoked' }, 404: errorResponse('NOT_FOUND') },
        },
      },
      '/api/analytics/overview': {
        get: {
          tags: ['Analytics'],
          summary: 'Headline counters (ADMIN only)',
          parameters: [queryParam('days', { type: 'integer', default: 30 }, 'Window in days')],
          responses: {
            200: {
              description: 'Overview',
              content: { 'application/json': { schema: ref('AnalyticsOverview') } },
            },
            403: errorResponse('FORBIDDEN'),
          },
        },
      },
      '/api/analytics/tickets-per-day': {
        get: {
          tags: ['Analytics'],
          summary: 'Created vs resolved per UTC day (ADMIN only)',
          parameters: [queryParam('days', { type: 'integer', default: 30 }, 'Window in days')],
          responses: {
            200: {
              description: 'Series',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'array', items: ref('TicketsPerDayPoint') } },
                  },
                },
              },
            },
          },
        },
      },
      '/api/analytics/first-response': {
        get: {
          tags: ['Analytics'],
          summary: 'Average and median first-response time per agent (ADMIN only)',
          parameters: [queryParam('days', { type: 'integer', default: 30 }, 'Window in days')],
          responses: {
            200: {
              description: 'Per-agent stats',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'array', items: ref('AgentResponseStat') } },
                  },
                },
              },
            },
          },
        },
      },
      '/api/analytics/breach-rate': {
        get: {
          tags: ['Analytics'],
          summary: 'SLA breach rate by priority (ADMIN only)',
          parameters: [queryParam('days', { type: 'integer', default: 30 }, 'Window in days')],
          responses: {
            200: {
              description: 'Breach rates',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'array', items: ref('BreachRateByPriority') } },
                  },
                },
              },
            },
          },
        },
      },
      '/api/audit-logs': {
        get: {
          tags: ['Audit'],
          summary: 'Paginated audit trail (ADMIN only)',
          parameters: [
            queryParam('page', { type: 'integer' }, 'Page number'),
            queryParam('pageSize', { type: 'integer' }, 'Rows per page'),
            queryParam('action', { type: 'string' }, 'Filter by action'),
            queryParam('actorId', { type: 'string' }, 'Filter by actor'),
            queryParam('entityType', { type: 'string' }, 'Filter by entity type'),
          ],
          responses: {
            200: {
              description: 'Page of audit rows',
              content: { 'application/json': { schema: paginatedOf('AuditLog') } },
            },
            403: errorResponse('FORBIDDEN'),
          },
        },
      },
      '/api/audit-logs/actions': {
        get: {
          tags: ['Audit'],
          summary: 'Distinct action names present in the tenant’s audit trail',
          responses: {
            200: {
              description: 'Actions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'array', items: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  } as const;
}

export type OpenApiDocument = ReturnType<typeof buildOpenApiDocument>;
