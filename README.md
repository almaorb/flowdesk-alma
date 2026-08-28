# FlowDesk

A multi-tenant customer support helpdesk: ticket queues with a guarded state
machine, live collaboration over WebSockets, an SLA engine, and an admin
analytics dashboard computed in SQL.

Two organizations, 14 users and 310 tickets are seeded on first boot, so every
screen has real data the moment the app comes up.

```
apps/api        Node + TypeScript + Express + Prisma + Socket.IO
apps/web        React 18 + TypeScript + Vite + TanStack Query + Tailwind
packages/shared Types, Zod schemas, the ticket state machine and SLA rules
```

---

## Quick start

### Option A — Docker (one command)

```bash
docker compose up --build
```

Then open **http://localhost:5173**.

The API container applies migrations and seeds the demo data before it starts
serving, so the first request already has 310 tickets behind it.

| Service | URL |
| --- | --- |
| Web app | http://localhost:5173 |
| API | http://localhost:4000/api |
| API reference (Swagger UI) | http://localhost:4000/api/docs |
| Health probe | http://localhost:4000/api/health |
| Postgres | `localhost:5433` (`flowdesk` / `flowdesk`) |

Set `SEED_ON_BOOT=false` to skip seeding. Re-running the seed is safe: it
rebuilds only the two demo organizations and never duplicates data.

### Option B — Local Node (what this repo was developed and verified against)

Requires **Node 20+** and a **PostgreSQL 14+** you can connect to.

```bash
# 1. Install
npm install

# 2. Create the databases (names are free to change; update .env to match)
createdb flowdesk
createdb flowdesk_test

# 3. Configure
cp apps/api/.env.example apps/api/.env
$EDITOR apps/api/.env          # set DATABASE_URL and TEST_DATABASE_URL

# 4. Migrate and seed
npm run db:deploy
npm run db:seed

# 5. Run both apps
npm run dev
```

The web app is on **http://localhost:5173** and proxies `/api` and `/socket.io`
to the API on port 4000, so the browser only ever talks to one origin.

### Demo logins

Password for every seeded account: **`Password123!`**

| Organization | Role | Email |
| --- | --- | --- |
| Northwind Support | Admin | `ada.lovelace@northwind.test` |
| Northwind Support | Agent | `grace.hopper@northwind.test` |
| Northwind Support | Customer | `bruno.silva@northwind.test` |
| Contoso Care | Admin | `marie.curie@contoso.test` |
| Contoso Care | Agent | `katherine.johnson@contoso.test` |

The two organizations exist so isolation can be checked by hand: sign in as the
Contoso admin, take a ticket id from Northwind, and request it — the API
returns `404`, never the row.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Shared package in watch mode + API + web |
| `npm test` | 180 tests (29 shared unit + 151 API) |
| `npm run lint` | ESLint across every workspace, zero warnings allowed |
| `npm run typecheck` | `tsc --noEmit` for all three workspaces |
| `npm run format` | Prettier write (`format:check` to verify) |
| `npm run build` | Production build of all three workspaces |
| `npm run db:migrate` | Create a new migration from schema changes |
| `npm run db:deploy` | Apply committed migrations (deployment path) |
| `npm run db:seed` | Rebuild the demo data |
| `npm run db:reset` | Drop, re-migrate and re-seed |

Tests need a **second** database (`TEST_DATABASE_URL`). The suite migrates it
with `prisma migrate deploy` before the first test and truncates between files,
so it never touches your development data.

---

## Feature tour

Sign in as the Northwind **admin** to see everything.

1. **Tickets** — filter by status, priority, assignee, tag and SLA state, search
   free text, sort by any column, page through 220 tickets. Every parameter is
   in the URL, so a filtered queue is a shareable link. Nothing is filtered in
   the browser.
2. **Ticket detail** — the status buttons are generated from the shared state
   machine, so the UI only ever offers transitions the API would accept. Replies,
   status changes, priority, assignee and tags all update optimistically.
3. **Realtime** — open the same ticket in two browsers (or sign in as the agent
   in a second window). A reply or status change appears in the other window in
   well under a second, with no refresh. The header shows the socket state.
4. **SLA** — breached tickets are flagged red in the list and on the ticket. The
   background sweep runs every 60 s; the seed already contains ~115 breaches.
5. **Analytics** (admin) — created vs resolved per day, average and median first
   response per agent, breach rate per priority. All four are SQL aggregations.
6. **Team** (admin) — change roles, deactivate members, and mint tokenized
   invite links. Copy a link, open it in a private window, and accept it to
   create a real user inside the organization.
7. **Audit log** (admin) — every state change, filterable by action, paginated.
8. **API reference** — http://localhost:4000/api/docs.

To see the role guards, sign in as `bruno.silva@northwind.test`: the queue
narrows to his own tickets, internal notes vanish, and Analytics, Team and Audit
disappear from the nav (and return `403` if requested directly).

---

## Architecture decisions

### Tenant isolation is enforced at the query layer

Handlers never hand-write `where: { orgId }` and hope. `tenantDb(orgId)`
(`apps/api/src/db/tenant.ts`) returns a Prisma client extension that rewrites
**every** operation on a tenant-owned model:

- reads, updates and deletes get `orgId = <caller's org>` merged into the where
  clause, applied **last**, so a spoofed `orgId` in a filter is overridden
  rather than honoured;
- creates get `orgId` stamped onto the payload regardless of what it contained;
- `TicketTag` has no `orgId` column, so it is scoped through its ticket relation.

A handler that forgets the filter is therefore still safe. The few genuinely
cross-tenant operations — login by email, refresh-token lookup, organization
creation — use the unscoped client explicitly, which makes them a short,
auditable list.

Cross-tenant reads return **404, not 403**, so the API never confirms that an id
exists in another organization. Row-level rules layer on top: a `CUSTOMER` only
sees their own tickets, and internal notes are filtered in SQL rather than
hidden in the UI.

### The state machine lives in shared code

`packages/shared/src/state-machine.ts` owns the transition graph and its role
rules, and both sides import it. The API returns `409 INVALID_TRANSITION` for an
edge that does not exist and `403 FORBIDDEN_TRANSITION` for a legal edge the
caller is not entitled to; the web client calls `transitionsFor()` to render the
status buttons, so the two can never disagree.

The documented happy path is `OPEN → IN_PROGRESS → WAITING_ON_CUSTOMER →
RESOLVED → CLOSED`, with `REOPENED` reachable only from `RESOLVED`/`CLOSED` and
only for an admin or the ticket's own customer. A handful of deliberate
back-edges exist because real queues need them (`WAITING_ON_CUSTOMER →
IN_PROGRESS`, `IN_PROGRESS → OPEN`, and closing from anywhere). Everything not
in the graph is a 409.

### The SLA deadline is materialised

`Ticket.slaDeadline` is stored, not computed at read time, so "breached" and
"due soonest" are indexed SQL predicates rather than something the app filters
in memory. It is recomputed whenever priority changes. The clock stops on the
first **public** comment from an `ADMIN` or `AGENT` — an internal note or a
customer's own reply does not count — and that moment is recorded on the ticket
(`firstResponseAt`, `firstResponderId`), which is also what the per-agent
analytics aggregate over. The background sweep and the seed share the same
`isSlaBreached()` predicate, so they cannot drift.

### Auth

Signup creates the organization and its first admin in one transaction. Access
tokens are short-lived JWTs (15 min). Refresh tokens are separate JWTs whose
SHA-256 hash is persisted, which makes them revocable; they are **single-use**,
and presenting one twice is treated as a compromise and revokes every live
session for that user. `requireAuth` re-reads the user on each request, so
deactivating or demoting someone takes effect immediately rather than at token
expiry.

Emails are globally unique, so login needs an email and password only, with no
tenant selector. The trade-off is that one person cannot hold accounts in two
organizations with the same address; a workspace picker on login would be the
fix if that mattered.

### Realtime

One Socket.IO connection per client, authenticated with the same access token as
the REST API. The server pins each socket to an `org:<id>` room on connect — the
client never chooses a room name, so it cannot subscribe to another tenant.
Events carry the full updated DTO, which the client writes straight into the
TanStack Query cache so an open ticket updates in place without a refetch.

Optimistic writes and socket echoes both reach the cache, in either order.
`upsertComment()` reconciles them so a reply cannot appear twice.

### Everything the dashboard shows is computed by Postgres

The four analytics endpoints are parameterised `$queryRaw` statements —
`generate_series` for a dense per-day calendar, `PERCENTILE_CONT` for medians,
`FILTER` clauses for conditional counts, `enum_range` so priorities with zero
tickets still appear. Every statement filters on the `orgId` taken from the
verified token, never from the request. Days are bucketed in UTC.

### Other choices worth naming

- **`type: module` everywhere.** One module system across the monorepo, no
  interop shims.
- **`bcryptjs` over `bcrypt`.** Pure JS, so no native toolchain in the Docker
  build. Login burns a constant amount of work even for unknown emails, so
  timing does not reveal which addresses exist.
- **Swagger UI is served from `swagger-ui-dist`**, not a CDN, so `/api/docs`
  works with no outbound network access. A test walks the live Express router
  and fails if a mounted route is missing from the spec.
- **Rate limiting** is keyed on IP **and** submitted email for auth endpoints, so
  one address cannot lock every account and a distributed attack still hits a
  per-account ceiling. IPv6 clients are bucketed by `/64`.
- **Attachments are metadata only**, per the brief — filename, type, size and an
  optional URL. No bytes are stored.

---

## Testing

```bash
npm test
```

**180 tests, all passing.**

| Suite | Tests | Covers |
| --- | --- | --- |
| `packages/shared` unit | 29 | Transition graph (reachability, no self-edges, REOPENED authorisation, customer limits), SLA maths |
| `tests/unit/auth` | 15 | bcrypt salting, constant-work unknown-email path, token claims, forged/expired/wrong-audience rejection, refresh rotation and reuse detection |
| `tests/api/tenancy` | 19 | Cross-tenant read **and** write probes on every resource, plus direct tests that the query extension rewrites a forgotten filter and overrides a spoofed `orgId` |
| `tests/api/transitions` | 15 | Happy path, 409 on illegal edges, 403 on unauthorised reopen, and proof a refused transition mutates and logs nothing |
| `tests/api/rbac` | 40 | Admin-only surfaces across all four principals, customer visibility, role changes, error-envelope consistency |
| `tests/api/tickets` | 24 | CRUD, pagination, every filter, case-insensitive search, sorting, SLA recomputation, internal-note visibility |
| `tests/api/sla` | 10 | What does and does not stop the clock, sweep correctness, idempotence, audit rows |
| `tests/api/auth` | 13 | Signup, duplicate email, login parity for wrong password vs unknown user, refresh rotation, full invite flow |
| `tests/api/analytics` | 8 | Each aggregation checked against directly-counted data |
| `tests/api/docs` | 7 | Spec validity and route coverage |

The API suite runs against a real Postgres database — no mocks — brought up
with the committed migrations.

---

## API surface

Full reference at `/api/docs`. Every error response is
`{ "error": { "code", "message", "fields"? } }` with a machine-readable `code`.

```
POST   /api/auth/signup           Create an organization + first admin
POST   /api/auth/login            Email + password -> token pair
POST   /api/auth/refresh          Rotate a refresh token (single use)
POST   /api/auth/logout           Revoke a refresh token
GET    /api/auth/me               Current user + organization
POST   /api/auth/accept-invite    Create an account from an invite token
GET    /api/public/invites/:token Look up an invite before accepting

GET    /api/tickets               List: page,pageSize,status,priority,assigneeId,
                                  customerId,tagId,q,slaBreached,sort,order
POST   /api/tickets               Create
GET    /api/tickets/:id           Detail with thread and attachments
PATCH  /api/tickets/:id           Update fields
DELETE /api/tickets/:id           Delete (ADMIN)
POST   /api/tickets/:id/transition        Move through the state machine
GET    /api/tickets/:id/comments          Thread (internal notes filtered)
POST   /api/tickets/:id/comments          Reply or internal note
POST   /api/tickets/:id/attachments       Record attachment metadata
DELETE /api/tickets/:id/attachments/:childId

GET    /api/users                 Organization directory
PATCH  /api/users/:id             Role / name / active (ADMIN)
GET    /api/tags, POST /api/tags, DELETE /api/tags/:id
GET    /api/invites, POST /api/invites, DELETE /api/invites/:id   (ADMIN)

GET    /api/analytics/overview          (ADMIN)
GET    /api/analytics/tickets-per-day   (ADMIN)
GET    /api/analytics/first-response    (ADMIN)
GET    /api/analytics/breach-rate       (ADMIN)
GET    /api/audit-logs                  (ADMIN)
GET    /api/audit-logs/actions          (ADMIN)
GET    /api/health
```

---

## Known limitations

Called out honestly rather than hidden.

1. **Docker Compose is authored but was not executed here.** The build
   environment had no Docker daemon. Both production builds were verified
   (`npm run build`), the compiled server was booted from `dist/` and its health
   and docs endpoints checked, and the migrate-then-seed sequence the entrypoint
   runs was exercised directly. The Compose wiring itself — image builds, nginx
   proxy, service healthchecks — is therefore unverified. **The local Node path
   in Quick Start is the one that has been run end to end.**
2. **Tokens are stored in `localStorage`.** The Socket.IO handshake needs the
   access token in JS. That means XSS could read them. The API already sets an
   httpOnly `fd_refresh` cookie alongside the JSON response, so moving to
   httpOnly refresh + in-memory access token is a client-side change.
3. **Free-text search is `ILIKE '%term%'`.** Correct and fully in SQL, but it
   cannot use a btree index. At scale this wants a `pg_trgm` GIN index or a
   `tsvector` column; both were left out because `CREATE EXTENSION` needs
   superuser and would make the migration fail on managed Postgres.
4. **Invite tokens are stored in the clear** so an admin can re-copy a link from
   the Team page. Hashing them (like refresh tokens) would mean showing the link
   exactly once. That is the better default; the product affordance won here.
5. **No email delivery.** Invites produce a link to copy. There is no outbound
   mail anywhere.
6. **The SLA engine measures first response only.** It does not model resolution
   SLAs, business hours, or pausing the clock while waiting on the customer —
   which the seed data itself files as a feature request.
7. **The realtime layer is single-process.** Socket.IO rooms live in one Node
   process, so running more than one API replica needs the Redis adapter.
8. **Rate limiting is in-memory** for the same reason, and resets on restart.
9. **The audit log is append-only by convention, not by grant.** The API only
   inserts, but the application database role could still delete. Real
   tamper-evidence wants a restricted role or an append-only table.
10. **No E2E browser tests.** Realtime propagation, optimistic updates and the
    invite flow were verified by hand in a browser (two sessions, live
    propagation confirmed) but are not automated. Playwright would be the next
    thing to add.
11. **Pagination is offset-based.** Fine at this size; deep pages on a large
    tenant would want keyset pagination.

## License

MIT
