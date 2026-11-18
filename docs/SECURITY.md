# LogiOps - Security

This document describes the security model of LogiOps as implemented in the codebase: the
authentication and authorisation model, password and token handling, input validation, transport
and browser-side protections, rate limiting, secret management, injection safety, data-retention
choices, logging hygiene, and the known limitations with a future-hardening list.

---

## Table of contents

- [1. Authentication and authorisation model](#1-authentication-and-authorisation-model)
- [2. Password hashing policy](#2-password-hashing-policy)
- [3. JWT handling](#3-jwt-handling)
- [4. Input validation with Zod](#4-input-validation-with-zod)
- [5. CORS policy](#5-cors-policy)
- [6. Helmet headers](#6-helmet-headers)
- [7. Rate limiting](#7-rate-limiting)
- [8. Secret management](#8-secret-management)
- [9. SQL-injection safety (Prisma)](#9-sql-injection-safety-prisma)
- [10. Soft delete vs hard delete](#10-soft-delete-vs-hard-delete)
- [11. Transport security (HTTPS/TLS)](#11-transport-security-httpstls)
- [12. Logging and PII hygiene](#12-logging-and-pii-hygiene)
- [13. Dependency and DoS considerations](#13-dependency-and-dos-considerations)
- [14. Known limitations and future hardening](#14-known-limitations-and-future-hardening)

---

## 1. Authentication and authorisation model

**Authentication** is stateless bearer-token auth built on JWT.

- `POST /api/v1/auth/login` verifies the submitted credentials with `bcrypt.compare` against the
  stored `passwordHash`, then signs an access token.
- The `authenticate` middleware (`src/middleware/auth.middleware.ts`):
  1. requires an `Authorization: Bearer <token>` header (else `401 Authentication required.`);
  2. verifies the token signature/expiry with `jwt.verify`;
  3. **re-loads the user from the database** by `decoded.userId` on every request (selecting only
     `id`, `name`, `email`, `role`) and rejects tokens whose user no longer exists (`401 User no
     longer exists.`);
  4. attaches the sanitised user to `req.user`.
- Distinct failure messages are returned for invalid vs expired tokens (`Invalid token.`,
  `Token expired.`).

**Authorisation (RBAC):** `authorize(...roles)` in the same file compares `req.user.role` against
the allowed roles and returns `403 Forbidden.` on mismatch. It is wired into the middleware
toolkit and ready for route-level use; no route currently restricts by role because both `ADMIN`
and `USER` are allowed to operate the platform.

**Resource-level authorisation:** chat conversations are scoped to the owner. Conversation lookups
use `findFirst({ where: { id, userId } })`, so a user can never read or append to another user's
conversation (a foreign conversation id yields `404 Conversation not found`).

---

## 2. Password hashing policy

- Passwords are hashed with **bcrypt** (`bcryptjs`) using a **cost factor of 12**
  (`bcrypt.hash(password, 12)`), both in the application and in `prisma/seed.ts`.
- Only the hash is persisted (`User.passwordHash`); plaintext passwords are never stored or logged.
- Login uses `bcrypt.compare`, which is constant-time with respect to the hash and mitigates
  timing-based user enumeration relative to naive string comparison.
- The login endpoint returns the same generic message (`Invalid email or password`) for both an
  unknown email and a wrong password, avoiding user enumeration by response content.
- Cost 12 is a deliberate work factor: strong against offline brute force while keeping login
  latency acceptable. Revisit if hardware or policy changes.

---

## 3. JWT handling

- **Algorithm:** HS256 (symmetric), signed with `JWT_SECRET`.
- **Claims:** `userId`, `email`, `role`, plus standard `iat`/`exp`.
- **Lifetime:** `JWT_EXPIRE` (default `15m`) - short, limiting the blast radius of a leaked token.
- **Secret:** read from `JWT_SECRET`; a development fallback is allowed only outside production.
  Production startup requires a configured secret of at least 32 characters.
- **Validation:** signature and expiry are verified on every protected request; the user is then
  re-loaded from the database, so revoked/deleted users cannot keep using a valid token.
- **Rotation:** changing `JWT_SECRET` invalidates all outstanding tokens (acceptable given the 15m
  lifetime). No refresh-token endpoint is exposed even though `REFRESH_TOKEN_EXPIRE` appears in the
  configuration.

---

## 4. Input validation with Zod

- Every module defines its request schema in a `*.validation.ts` file (single source of truth).
- The `validate(schema)` middleware (`src/middleware/validate.middleware.ts`) parses `req.body`
  with the schema **before** the controller runs; the parsed (and typed, coerced, defaulted) value
  replaces `req.body`.
- On failure it throws `AppError('Validation failed', 422, errors)` where `errors` is a list of
  `{ field, message }` derived from `ZodError`. The global error handler renders them in the
  response envelope.
- Validation rules in use include: email format, string length bounds (for example customer
  `name` 2-100, `company` 2-150, chat `message` 1-2000), required fields, and enum membership for
  `status` (`CustomerStatus`, `ShipmentStatus`). Unknown/extra fields are stripped by Zod's default
  object behaviour, so clients cannot inject arbitrary columns into Prisma writes.
- Bodies are size-limited by `express.json({ limit: '10mb' })` and
  `express.urlencoded({ limit: '10mb' })`.

---

## 5. CORS policy

CORS is configured with an explicit allow-list rather than a wildcard:

```ts
cors({
  origin: corsOrigins,
  credentials: true,
  optionsSuccessStatus: 200,
})
```

- `env.CORS_ORIGIN` (default `http://localhost:5173`) is always allowed; localhost development
  origins are added only when `NODE_ENV` is not `production`.
- `credentials: true` is set to match the Socket.IO CORS configuration; no cookies are used for
  auth (tokens are sent in the `Authorization` header).
- The Socket.IO server applies a matching origin list and verifies the Bearer JWT in the connection
  handshake before accepting a client.
- **Production note:** set `CORS_ORIGIN` to the deployed SPA origin and remove the localhost
  entries.

---

## 6. Helmet headers

`helmet()` is applied globally as the first middleware in `app.ts`. It sets a suite of
security-related HTTP response headers by default, including (among others) `Content-Security-
Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`, `Strict-Transport-
Security` (when served over HTTPS), `Referrer-Policy` and disables `X-Powered-By`. The defaults are
retained; no per-directive overrides are currently applied.

---

## 7. Rate limiting

- `express-rate-limit` is mounted on the `/api/` path prefix (so `/health` is not throttled).
- Window and maximum are environment-driven: `RATE_LIMIT_WINDOW_MS` (default `900000` = 15 min) and
  `RATE_LIMIT_MAX_REQUESTS` (default `1000`).
- On limit breach the client receives `429` with body
  `{ "success": false, "message": "Too many requests." }`. Standard `RateLimit-*` headers are
  emitted; legacy headers are disabled.
- **Production note:** the default limits are generous for demos; tighten them per endpoint/environment,
  and consider a shared store (for example Redis) if the API scales to multiple instances, since the
  default store is per-process.

---

## 8. Secret management

- Secrets are supplied exclusively through environment variables and loaded via
  `src/config/env.config.ts` (dotenv). `.env` files are local and git-ignored.
- Secrets in scope: `JWT_SECRET`, `DATABASE_URL` (credentials embedded), and `OPENAI_API_KEY` when
  the hosted AI provider is enabled. The analytics service has only non-secret configuration.
- No credentials are hardcoded in source. The development `JWT_SECRET` fallback is rejected in
  production unless a secret of at least 32 characters is configured.
- **Production (proposed):** store secrets in Azure Key Vault and resolve them via App Service Key
  Vault references + managed identity, so no secret value lives in app configuration or CI. See
  [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md).
- The Docker Compose PostgreSQL credentials (`postgres` / `postgres123`) are local-development
  defaults only and must not be reused anywhere reachable.

---

## 9. SQL-injection safety (Prisma)

- All database access goes through **Prisma Client**, which builds **parameterised queries**. User
  input is passed as bound parameters, not interpolated into SQL strings, which structurally
  prevents classic SQL injection.
- Raw SQL is not used anywhere in the codebase; there are no `$queryRaw`/`$executeRaw` calls that
  could reintroduce interpolation risk.
- Query filters are constructed from validated values (for example `where.status = status` after
  Zod enum validation), so even filter values are constrained.
- Repository methods are the only place Prisma is used, keeping the data-access surface small and
  auditable.

---

## 10. Soft delete vs hard delete

- Customers are **soft deleted**: `DELETE /api/v1/customers/:id` sets `Customer.deletedAt` and every
  read path filters on `deletedAt: null`.
- Security/consistency rationale: shipment history stays correctly attributed (no orphaned rows),
  the action is reversible, and no destructive cascade is triggered.
- A soft-deleted customer is treated as absent by detail/update/delete (returns `404`), so it
  cannot be modified through the API once removed.
- Participants: shipments are not soft-deleted because they are shared operational records.
- **Data-handling consequence:** a soft-deleted customer's PII remains in the database. If a hard
  erasure is required (for example a GDPR-style request), a separate purge/retention process must be
  introduced (see section 14).

---

## 11. Transport security (HTTPS/TLS)

- In local development the services run over plain HTTP on localhost; this is acceptable because
  traffic does not leave the machine.
- **Any non-local deployment must be HTTPS/TLS.** The proposed Azure topology terminates TLS at
  Static Web Apps (frontend) and App Service (backend and analytics), uses WSS for Socket.IO, and
  requires `sslmode=require` for the PostgreSQL connection.
- `helmet()` enables HSTS when responses are served over HTTPS, instructing browsers to use HTTPS
  for subsequent requests.
- Tokens are only ever sent in the `Authorization` header over TLS; no tokens are placed in URLs.

---

## 12. Logging and PII hygiene

- Logging uses **Winston** (`src/utils/logger.ts`) with JSON formatting and colorized console
  output; morgan logs HTTP requests (level `dev` in development, `combined` in production).
- Logged content: lifecycle events (server start, DB connect, socket connect/disconnect) and error
  objects with stack traces. Requests are logged at the morgan level (method, path, status,
  latency, size).
- **Not logged:** passwords, password hashes, JWT secrets, tokens, and full request bodies. Error
  responses in production return the generic `Internal server error` rather than the exception
  message, avoiding information disclosure.
- **PII exposure:** morgan's `combined` format includes the URL; endpoints do not carry PII in the
  path (ids are opaque `cuid`s). Query strings can include a `search` term, so avoid adding PII to
  query strings. Structured logs should be shipped to a controlled sink (for example Log Analytics)
  with appropriate retention and access controls.
- The chat assistant does not persist a fabricated response: if the configured AI provider fails,
  it logs the failure and returns a service-unavailable response without saving a partial turn.

---

## 13. Dependency and DoS considerations

- **Body/upload limits:** JSON and urlencoded bodies are capped at 10 MB; the analytics service caps
  CSV uploads at `MAX_FILE_SIZE_MB` (default 5 MB) and Flask rejects larger bodies via
  `MAX_CONTENT_LENGTH` before fully buffering them.
- **Rate limiting:** `/api/*` is throttled (section 7) to blunt brute-force and flooding.
- **Bounded work per request:** the chat replays at most the last 20 messages; the analytics
  aggregation is linear in the (bounded) CSV size.
- **Dependency surface:** the backend uses a small, mainstream dependency set (Express, Prisma,
  Zod, jsonwebtoken, bcryptjs, helmet, cors, express-rate-limit, morgan, socket.io, winston). Keep
  dependencies patched and review advisories (`npm audit`, Dependabot). The analytics service
  similarly uses a short list (Flask, flask-cors, pandas, plotly, gunicorn).
- **Error handling:** `unhandledRejection` and `uncaughtException` handlers log and terminate the
  process rather than continuing in an unknown state.

---

## 14. Known limitations and future hardening

The following are known gaps. They are acceptable for the current scope but should be closed before
a production rollout.

- **No refresh-token flow / no revocation list.** Short access-token lifetime limits exposure, but
  there is no explicit logout/revocation. Consider refresh tokens with rotation and a denylist.
- **No account lockout / MFA.** Login throttling is only via the general rate limit. Add
  per-account lockout, MFA, and (in production) Entra ID with conditional access.
- **No per-user socket rooms.** The handshake is authenticated, but status events are broadcast to
  every authenticated client. Add room-level authorization if event visibility becomes user- or
  tenant-specific.
- **CORS origins must be configured for deployment.** The backend's localhost origins are
  development-only, and the analytics service defaults to `http://localhost:5173`; configure both
  services with the deployed frontend origin.
- **Rate-limit store is in-memory/per-process.** Use a shared store (e.g. Redis) when scaling out.
- **RBAC is available but unused at the route level.** Apply `authorize('ADMIN')` to privileged
  endpoints (for example customer deletion) if the business requires it.
- **Soft-deleted PII is retained indefinitely.** Define a retention/purge policy and an erasure path
  for privacy obligations.
- **No database-level migration of secrets / no encryption at rest configured locally.** Rely on the
  managed service (Azure) for encryption at rest, TLS in transit and backups.
- **Development `JWT_SECRET` fallback exists outside production.** Production startup rejects a
  missing or weak secret.
- **No security tests / SAST in CI yet.** Add dependency scanning, secret scanning and basic
  automated security checks to the pipeline.
- **Analytics uploads are validated but not scanned.** Add antivirus/content scanning if untrusted
  uploads are accepted in production.
