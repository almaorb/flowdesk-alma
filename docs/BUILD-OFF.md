# FlowDesk Build-Off — Alma vs Devin

Two agents were given the identical brief in [`../PROMPT.md`](../PROMPT.md). This is a
side-by-side evaluation of the two resulting repositories, run on the same machine against
the same probes on 28 Aug 2026.

- **Alma** — <https://github.com/almaorb/flowdesk-alma> (this repository)
- **Devin** — <https://github.com/almaorb/flowdesk-devin>

An interactive version of this report is published as an artifact; this file is the
GitHub-readable copy.

---

## Disclosure

**This evaluation was authored by the agent that built the Alma entry.** It cannot be a
neutral judge of its own work. Everything below is either a measurement anyone can re-run
or a design difference with both sides shown. Where a call is judgement rather than
measurement, it says so.

Worth recording, because it shaped the result: the first probe run scored Devin 16/22, and
the second scored it 4/12. **Both were bugs in the harness, not in Devin's code.** The probe
assumed Alma's route names, response envelope and query-parameter spelling, and twice the
previous run's rate-limit hammering was still locking out the next run. After fixing the
harness, both entrants pass every probe. A comparison that flatters the author's own build
on first run is usually measuring the harness.

---

## Headline result

|                            | Alma            | Devin         |
| -------------------------- | --------------- | ------------- |
| Live behavioural probes    | 19/19           | 19/19         |
| Automated tests (executed) | 180/180 passing | 42/42 passing |
| Lint (`--max-warnings=0`)  | clean           | clean         |
| Typecheck                  | clean           | clean         |
| Production build           | builds          | builds        |
| All 8 required features    | yes             | yes           |

**Both builds are complete and correct against the brief.** They separate on depth, not
function.

---

## Live probe matrix

Both APIs were booted simultaneously (Alma on `:4000`, Devin on `:4200`) and hit with the
same requests, adapted per repo only for route names, response envelope and query-parameter
spelling. Observed behaviour, not code review.

| Probe                                  | Alma | Devin | Observed                                                |
| -------------------------------------- | :--: | :---: | ------------------------------------------------------- |
| All four roles authenticate            | PASS | PASS  | admin, agent, customer, second-org admin                |
| Server-side pagination                 | PASS | PASS  | correct page metadata on both                           |
| Free-text search narrows in SQL        | PASS | PASS  | `q=webhook` → 15 of 220 · 9 of 140                      |
| Status + priority filter               | PASS | PASS  | both narrowed to 4 rows                                 |
| SLA-breach filter                      | PASS | PASS  | 81 breached · 50 breached                               |
| Sort by priority desc                  | PASS | PASS  | both returned URGENT first                              |
| Unauthenticated request refused        | PASS | PASS  | 401 on both                                             |
| Cross-tenant read/patch/comment/delete | PASS | PASS  | 404 on all four verbs — no existence oracle             |
| Search scoped per tenant               | PASS | PASS  | 220/90 vs 140/80 across the two orgs                    |
| Illegal edge `CLOSED → IN_PROGRESS`    | PASS | PASS  | 409 `INVALID_TRANSITION` on both                        |
| Agent barred from reopening            | PASS | PASS  | 403 `FORBIDDEN_TRANSITION` · 409 `TRANSITION_FORBIDDEN` |
| Admin may reopen                       | PASS | PASS  | 200 on both                                             |
| 400 with field-level errors            | PASS | PASS  | both return per-field messages                          |
| Consistent error envelope              | PASS | PASS  | `{ error: { code, message } }` on both                  |
| Customer blocked from analytics        | PASS | PASS  | 403 on both                                             |
| Agent blocked from audit log           | PASS | PASS  | 403 on both                                             |
| Analytics computed in SQL              | PASS | PASS  | 4 endpoints · 1 consolidated endpoint                   |
| OpenAPI + Swagger UI served            | PASS | PASS  | 200 on both                                             |
| Auth rate limiting engages             | PASS | PASS  | 429 after 19 · after 16 bad attempts                    |

---

## Measured ledger

| Measure                                     |   Alma | Devin |
| ------------------------------------------- | -----: | ----: |
| Automated tests (all executed, all passing) |    180 |    42 |
| Test files                                  |     11 |     7 |
| Total lines of code                         | 12,199 | 6,542 |
| — shared package                            |    874 |   437 |
| — API (incl. tests + migration)             |  7,250 | 3,923 |
| — web                                       |  4,075 | 2,182 |
| API route modules                           |      8 |     6 |
| Web pages                                   |     11 |     8 |
| Seeded tickets                              |    310 |   220 |
| Seeded users                                |     14 |    11 |
| README lines                                |    350 |   130 |
| Commits                                     |     11 |    12 |

Bigger is not automatically better. Devin reaches the same functional bar in roughly half
the code, which is its own merit: less surface to maintain.

---

## Test suites, executed

The brief required unit tests for auth and the ticket state machine, plus at least five API
integration tests. **Both clear that bar comfortably.** Everything above it is depth, not
compliance.

| Area under test                        |    Alma |  Devin |
| -------------------------------------- | ------: | -----: |
| Auth — unit                            |      15 |      7 |
| Ticket state machine — unit            |      20 |      6 |
| SLA rules — unit                       |       9 |      3 |
| Tenancy — integration                  |      19 |      7 |
| Tickets / CRUD / filters — integration |      24 |      8 |
| Auth flows — integration               |      13 |      6 |
| Analytics + audit — integration        |       8 |      5 |
| Transitions — integration              |      15 |      — |
| RBAC — integration                     |      40 |      — |
| SLA sweep — integration                |      10 |      — |
| OpenAPI route coverage                 |       7 |      — |
| **Total (all passing)**                | **180** | **42** |

Devin covers transitions in its unit suite rather than a separate integration file, and
folds the SLA sweep into its analytics file. Both suites run against real Postgres with no
mocks.

---

## Where they actually differ

### Substantive

**1. Tenant isolation is structural vs. by convention.**
Alma uses a Prisma client extension that rewrites every operation on a tenant model,
injecting `orgId` last — a spoofed filter is overridden, and a handler that forgets the
filter is still safe. Devin uses a `ticketScope()` helper returning a `where` fragment that
each handler spreads into its own query.

_Both return 404 on every cross-tenant probe today._ The difference is what happens to the
next handler someone writes. Alma's approach was verified directly by issuing a deliberately
unscoped query; no equivalent escape was constructed for Devin, so this is an architectural
observation, **not a demonstrated vulnerability**.

**2. Auth rate limiting keys on IP only vs. IP + email.**
Devin uses the library default (IP-only): hammering one account locked out _every_ account
from that address — hit by accident during testing, requiring a server restart. Alma keys on
`ip:email`, so other accounts stayed usable.

Both satisfy the brief. It is a genuine trade-off: IP-only throttles credential-stuffing
across many accounts more aggressively, but behind office NAT or CGNAT one user's failures
lock out everyone.

### Legitimate taste

**3. State-machine strictness.** Alma refuses `OPEN → RESOLVED` with 409; Devin allows it as
a deliberate edge. The brief's arrow diagram is ambiguous about whether intermediate states
are mandatory. Both readings are defensible, and both refuse genuinely illegal edges.

**4. Refused-transition status code.** Alma returns 403 `FORBIDDEN_TRANSITION` for a legal
edge attempted by the wrong actor; Devin returns 409 `TRANSITION_FORBIDDEN` for all
refusals. The brief mandates 409 only for _invalid transitions_ and is silent on the
authorisation case.

**5. Analytics surface.** Alma exposes four endpoints with a 7/30/90-day toggle and median
as well as mean first response; Devin returns everything from one `/analytics/overview`.
Both compute in Postgres as required. Devin's is one round trip; Alma's is more granular and
cacheable.

---

## Method

- Both repos cloned fresh; dependencies installed from their own lockfiles.
- Each got its own Postgres database, migrated with its own committed migrations and seeded
  with its own seed script.
- Both APIs booted simultaneously and hit by the same probe script.
- Both web apps driven in a real browser: sign-in, queue, filters, ticket detail, dashboard,
  audit log, and a live comment posted from a second session. **Both propagated in real time
  without a refresh.**
- The rate-limit probe fires 25 bad logins and must run last; it poisons any subsequent run
  until the server restarts. Both were restarted before the final numbers.

## Not verified

- **Neither Docker stack was run** — no Docker daemon on the evaluation machine. Both repos
  ship compose files and Dockerfiles, verified only as far as their production builds.
- **No load, concurrency or long-run testing.** Both realtime layers are single-process.
- **Seed data differs**, so absolute counts are not comparable between systems — only each
  system's internal consistency was checked.
- **Accessibility, mobile layout and browser-console cleanliness** were not systematically
  audited on either UI.

---

## The honest read

On the brief as written, both builds are complete and correct. All eight required features
work in both; all nineteen probes pass on both; lint, typecheck and production builds are
clean on both.

They separate on depth rather than function. Alma carries 4× the automated tests, tenant
isolation that fails closed rather than relying on convention, a rate limiter that avoids
collateral lockout, and a README naming eleven limitations instead of eight. Devin reaches
the same functional bar in roughly half the code, with a consolidated analytics endpoint
that is arguably the better API design.

If you are picking a winner on the spec alone, it is a draw. If you are picking on what you
would rather inherit and extend, the tie breaks on tests and on tenant isolation that cannot
be forgotten.
