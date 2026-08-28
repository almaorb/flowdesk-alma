# Build brief

This repository was built in one uninterrupted session from the brief below,
reproduced verbatim. It is kept here so the result can be read against what was
actually asked for.

The brief came with a separate evaluation rubric marked "don't paste into the
tools" — that half is deliberately not reproduced here.

---

Build a production-quality, full-stack web application called **FlowDesk** — a multi-tenant customer support helpdesk with real-time collaboration and analytics. Work in this repository and push your work as commits to the main branch (or a PR into main, your choice, but the final state must be on the repo). You have 1 session / uninterrupted run to complete as much as possible. Do not ask clarifying questions; make reasonable decisions and document them in the README.

### Tech constraints (mandatory — for fair comparison)

- **Backend:** Node.js + TypeScript, Express or Fastify, REST API
- **Database:** PostgreSQL via Prisma ORM (include migrations + seed script). Use SQLite only if Postgres is unavailable in your environment, but keep the Prisma schema Postgres-compatible.
- **Frontend:** React 18 + TypeScript + Vite, React Router, TanStack Query. Styling: Tailwind CSS.
- **Auth:** Email/password with JWT (access + refresh tokens), bcrypt hashing.
- **Real-time:** WebSockets (Socket.IO or native ws) for live ticket updates.
- **Tests:** Vitest or Jest. Minimum: unit tests for auth + ticket state machine, and at least 5 API integration tests.
- **Tooling:** ESLint + Prettier configured and passing. A single docker-compose.yml that brings up db + api + web. A root README.md with setup instructions that actually work.
- Monorepo layout: /apps/api, /apps/web, shared types in /packages/shared.

### Domain model (minimum)

Organizations (tenants) → Users (roles: ADMIN, AGENT, CUSTOMER) → Tickets → Comments → Tags → Attachments (metadata only, no file storage needed) → AuditLog. All data is tenant-isolated: a user must never be able to read or mutate another organization's data (enforce at the query layer, not just the UI).

### Ticket state machine

OPEN → IN_PROGRESS → WAITING_ON_CUSTOMER → RESOLVED → CLOSED, plus REOPENED (only from RESOLVED/CLOSED, only by ADMIN or the ticket's customer). Invalid transitions must return 409 with a machine-readable error code. Every transition writes an AuditLog row.

### Required features

1. **Auth & tenancy:** signup creates an org + admin; admins invite users via tokenized invite links; login/logout/refresh; role-based route guards on both API and frontend.
2. **Ticket CRUD** with priority (LOW/MEDIUM/HIGH/URGENT), assignment to agents, tags, threaded comments, and optimistic UI updates.
3. **List view** with server-side pagination, filtering (status, priority, assignee, tag, free-text search on title/body), and sorting — all via query params, all done in SQL (no in-memory filtering).
4. **Real-time:** when a ticket is updated/commented, all connected users of that org viewing the list or that ticket see the change within 2 seconds without refreshing.
5. **SLA engine:** each priority has a response deadline (URGENT 1h, HIGH 4h, MEDIUM 24h, LOW 72h). A background job (setInterval is fine) marks tickets slaBreached=true when no agent comment exists before the deadline; breached tickets are visually flagged.
6. **Analytics dashboard** (admin only): tickets created/resolved per day (last 30 days, chart), avg first-response time per agent, breach rate by priority. Computed via SQL aggregation endpoints, not client-side.
7. **Audit log page** (admin only) with pagination.
8. **Seed script** creating 2 orgs, 10 users, 200+ tickets with realistic distributions across statuses/priorities/dates, so the dashboard and filters are demonstrably working.

### API quality requirements

- Zod (or equivalent) validation on every mutating endpoint; 400s with field-level errors.
- Consistent error envelope { error: { code, message } }.
- Rate limiting on auth endpoints.
- OpenAPI spec (generated or hand-written) at /api/docs.

### Definition of done

docker compose up (or documented equivalent) yields a working app at a documented URL; npm test passes; npm run lint passes; seed data is loaded; the README documents architecture decisions, how to run, and known limitations. Commit incrementally with meaningful messages — do not squash everything into one commit.
