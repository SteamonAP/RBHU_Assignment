# LogiOps - Architecture

This document describes the architecture of LogiOps: the layered design of the backend, the
responsibilities of each module and component, the request lifecycle
(route -> validation -> controller -> service -> repository -> Prisma -> PostgreSQL), the project
structure of all three services, the WebSocket and AI flows, and the key design decisions and
their trade-offs.

---

## Table of contents

- [1. System overview](#1-system-overview)
- [2. Layered architecture](#2-layered-architecture)
- [3. Module responsibilities](#3-module-responsibilities)
- [4. Request lifecycle](#4-request-lifecycle)
- [5. Project structure](#5-project-structure)
- [6. WebSocket event flow](#6-websocket-event-flow)
- [7. AI chat flow and provider abstraction](#7-ai-chat-flow-and-provider-abstraction)
- [8. Analytics service design](#8-analytics-service-design)
- [9. Design decisions and trade-offs](#9-design-decisions-and-trade-offs)
- [10. Scalability and deployment topology](#10-scalability-and-deployment-topology)

---

## 1. System overview

LogiOps is a three-service system sharing one PostgreSQL database:

```text
                            +-------------------------------------------+
                            |                Client                     |
                            |   React 19 SPA (Vite) - http://:5173      |
                            +------------------+------------------------+
                                               |
                    REST (JSON, /api/v1)       |        Socket.IO (WebSocket)
                    multipart CSV upload       |        same origin/port
                                               v
        +----------------------------------+        +-------------------------------+
        |  Backend API                     |        |  Analytics service            |
        |  Node.js + Express + TypeScript  |        |  Python Flask + Pandas        |
        |  http://:5000                    |        |  http://:5001                 |
        |                                  |        |                               |
        |  middleware -> routes ->         |        |  /health                      |
        |  controllers -> services ->      |        |  /analyze (CSV in, JSON out)  |
        |  repositories -> Prisma          |        |                               |
        |                                  |        +-------------------------------+
        |  Socket.IO server (same port)    |
        |  AI chat module (+ providers)    |
        +------------------+---------------+
                           |
                           v
        +----------------------------------+
        |  PostgreSQL 18 (Docker)          |
        |  host port 5433, db assessment_db|
        +----------------------------------+
```

The backend is the only service that talks to PostgreSQL. The analytics service is stateless and
self-contained: it receives a CSV, computes aggregates in memory with Pandas, and returns JSON
(including Plotly figure objects). It shares no database with the API.

---

## 2. Layered architecture

The backend is organised in strict, one-directional layers. A request always flows downward; each
layer depends only on the layer below it.

```text
   +---------------------------------------------------------------+
   |  HTTP layer     routes (Express routers, mounted in app.ts)   |
   +---------------------------------------------------------------+
             |                       ^
             v                       |
   +---------------------------------------------------------------+
   |  Cross-cutting  middleware/ (authenticate, authorize,         |
   |                 validate, error handler, notFound)            |
   +---------------------------------------------------------------+
             |                       ^
             v                       |
   +---------------------------------------------------------------+
   |  Transport      controller/ (HTTP status + response envelope) |
   +---------------------------------------------------------------+
             |                       ^
             v                       |
   +---------------------------------------------------------------+
   |  Domain         service/ (business rules, throws AppError)    |
   +---------------------------------------------------------------+
             |                       ^
             v                       |
   +---------------------------------------------------------------+
   |  Persistence    repository/ (Prisma queries, filters, paging) |
   +---------------------------------------------------------------+
             |                       ^
             v                       |
   +---------------------------------------------------------------+
   |  Infrastructure Prisma Client -> PostgreSQL                   |
   |                 Socket.IO server (websocket/)                 |
   +---------------------------------------------------------------+
```

Rules that keep the layering honest:

- **routes** declare the HTTP method and path, attach `authenticate` / `validate(schema)` and the
  controller handler. No business logic.
- **controller** parses request inputs, calls exactly one service method, chooses the HTTP status
  code and shapes the `{ success, message, data, meta? }` envelope. No data access.
- **service** owns business rules and orchestration; it throws `AppError` for domain failures
  (for example, "Shipment not found" with status 404). Services are the only layer that decides
  *what* should happen.
- **repository** is the only layer that touches Prisma. It builds queries, filters, pagination and
  performs persistence.
- **Cross-cutting concerns** live in `middleware/` (auth, validation, error handling),
  `errors/` (`AppError`), `infrastructure/` (Prisma client, Socket.IO) and `utils/` (logger), and
  are shared by all modules.

Consequences of the rules:

- Controllers never import Prisma directly.
- Services never build HTTP responses.
- Repositories return data; they do not throw HTTP-flavoured errors for business rules (the
  service decides the outcome, including 404s).
- Zod schemas live in each module's `*.validation.ts` and are the single source of truth for the
  request body shape.

The `auth` module is a small exception in shape: it has no repository because its data access
(user lookup) is trivial and lives directly in `auth.service.ts`.

---

## 3. Module responsibilities

### 3.1 Backend modules (`backend/src/modules/`)

| Module | Files | Responsibility |
| --- | --- | --- |
| `auth` | controller, routes, service, validation | `POST /login` (bcrypt compare + JWT sign), `GET /me`. Owns token issuance and credential verification. |
| `customer` | controller, routes, service, repository, validation | CRUD over customers, pagination/search/status filter, soft delete. |
| `shipment` | controller, routes, service, repository, validation | CRUD over shipments, pagination/search/status/customerId filter, status transitions, and emitting the realtime event. |
| `dashboard` | controller, routes, service | Live aggregation: totals and per-status distribution, computed with Prisma `count`/`groupBy`. |
| `chat` | controller, routes, service, repository, validation, providers | User-scoped conversations, history replay, provider selection and explicit provider error handling. |

### 3.2 Cross-cutting components

| Component | Location | Responsibility |
| --- | --- | --- |
| App bootstrap | `src/app.ts` | Builds the Express app; applies helmet, CORS, body parsing, morgan, rate limiting; mounts `/health` and the module routers; registers not-found and error handlers. |
| HTTP server | `src/server.ts` | Creates the `http.Server`, connects Prisma, initializes Socket.IO, listens on `env.PORT`, handles `unhandledRejection`/`uncaughtException`/`SIGTERM`. |
| Auth middleware | `src/middleware/auth.middleware.ts` | `authenticate` verifies the Bearer JWT and loads the user from the DB; `authorize(...roles)` enforces RBAC. |
| Validation middleware | `src/middleware/validate.middleware.ts` | Runs Zod schemas against request bodies and list-query parameters; on failure throws `AppError(422)` with field-level errors. |
| Error middleware | `src/middleware/error.middleware.ts` | Maps `AppError` and Prisma `P2002` (duplicate) to consistent responses; a `notFoundHandler` returns 404. |
| Error type | `src/errors/AppError.ts` | Operational error carrying a status code, an `isOperational` flag and optional field errors. |
| Env config | `src/config/env.config.ts` | Loads and types all environment variables with sane fallbacks. |
| Prisma client | `src/infrastructure/prisma/prisma.client.ts` | Singleton Prisma client (reused across hot reloads in dev). |
| Socket.IO | `src/infrastructure/websocket/socket.server.ts` | Initializes the Socket.IO server on the shared HTTP server and exposes `getIO()`. |
| Logger | `src/utils/logger.ts` | Winston logger (level by `NODE_ENV`, colorized console output). |

### 3.3 Frontend SPA (`frontend/`)

- Renders the authenticated UI: Dashboard, Customers, Shipments, Analytics and AI Chat.
- Holds an **auth context** with the JWT and current user; guards routes and redirects to login
  when unauthenticated.
- Calls the REST API at `VITE_API_URL` (default `http://localhost:5000/api/v1`) using Axios, with
  TanStack Query managing server state (caching, invalidation, refetching).
- Opens a Socket.IO connection to `VITE_SOCKET_URL` and reacts to `shipment_status_changed` by
  invalidating queries and showing a toast.
- Uploads CSVs to the analytics service at `VITE_ANALYTICS_API_URL` and renders the returned
  chart data.
- Styled with Tailwind CSS; routing with React Router.

### 3.4 Analytics service (`analytics-service/`)

- Stateless Flask microservice exposing `GET /health` and `POST /analyze`.
- Validates the uploaded CSV (extension, size, required columns, numeric/non-negative revenue) and
  computes descriptive statistics with Pandas.
- Builds Plotly figure JSON for API consumers; the SPA renders the returned aggregates with Recharts.
- Returns errors using the same `{ success, message, errors[] }` envelope as the API.

### 3.5 Database (PostgreSQL 18 via Docker)

- Stores `User`, `Customer`, `Shipment`, `ChatConversation` and `ChatMessage`.
- Runs locally in Docker and is mapped to host port `5433` (container `5432`).

---

## 4. Request lifecycle

Every protected API request flows through the same pipeline
(`route -> validation -> controller -> service -> repository -> Prisma -> PostgreSQL`):

```text
1. HTTP request lands on the Express app (port 5000)
2. Global middleware
     helmet()            -> security headers
     cors()              -> origin allow-list + credentials
     express.json()      -> body parsing (10 MB limit)
     morgan()            -> request logging
     rateLimit()         -> applies to /api/* (window + max from env)
3. Route match         -> e.g. app.use("/api/v1/shipments", shipmentRoutes)
4. authenticate        -> verifies Bearer JWT, loads the user, sets req.user
5. validate(schema)    -> Zod parses req.body and list-query parameters; on failure throws AppError(422)
6. Controller          -> calls the module service, shapes the response envelope
7. Service             -> business rules; throws AppError for domain failures
8. Repository          -> Prisma data access (findMany / create / update / ...)
9. Prisma Client       -> parameterised SQL to PostgreSQL
10. Response           -> { success, message, data, meta? } or { success:false, message, errors? }
```

Example: `PATCH /api/v1/shipments/:id/status`:

```text
Route (shipment.routes.ts)
  -> authenticate
  -> validate(updateShipmentStatusSchema)   // { status } must be a valid ShipmentStatus
  -> shipmentController.updateStatus
  -> shipmentService.updateShipmentStatus
       -> shipmentRepository.findById        (404 if missing; capture previousStatus)
       -> shipmentRepository.updateStatus     (Prisma update)
       -> getIO().emit("shipment_status_changed", {...})   // only after the DB write
  -> controller responds { success:true, message:"Status updated", data:<shipment> }
```

### Response envelope

Success (list with pagination):

```json
{ "success": true, "message": "Shipments retrieved", "data": [ ... ], "meta": { "page": 1, "limit": 10, "total": 4, "totalPages": 1 } }
```

Error:

```json
{ "success": false, "message": "Validation failed", "errors": [ { "field": "email", "message": "Invalid email" } ] }
```

### HTTP status codes

| Code | When |
| --- | --- |
| 200 | Successful read/update (and login) |
| 201 | Resource created (customer, shipment) |
| 400 | Malformed / bad request |
| 401 | Missing/invalid/expired token, bad credentials |
| 403 | Authenticated but not permitted (role check) |
| 404 | Resource or route not found |
| 409 | Duplicate unique value (Prisma `P2002`, e.g. email or tracking number) |
| 422 | Zod validation failure |
| 429 | Rate limit exceeded |
| 500 | Unhandled server error |

---

## 5. Project structure

### 5.1 Backend (`backend/`)

```text
backend/
├── prisma/
│   ├── schema.prisma            Data model, enums, relations
│   └── seed.ts                  Idempotent seed (admin, customers, shipments)
├── src/
│   ├── config/
│   │   └── env.config.ts        Typed environment access
│   ├── errors/
│   │   └── AppError.ts          Operational error type
│   ├── infrastructure/
│   │   ├── prisma/
│   │   │   └── prisma.client.ts Prisma client singleton
│   │   └── websocket/
│   │       └── socket.server.ts Socket.IO bootstrap + getIO()
│   ├── middleware/
│   │   ├── auth.middleware.ts   authenticate + authorize
│   │   ├── validate.middleware.ts Zod validation runner
│   │   └── error.middleware.ts  globalErrorHandler + notFoundHandler
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.validation.ts
│   │   ├── customer/
│   │   │   ├── customer.controller.ts
│   │   │   ├── customer.repository.ts
│   │   │   ├── customer.routes.ts
│   │   │   ├── customer.service.ts
│   │   │   └── customer.validation.ts
│   │   ├── shipment/
│   │   │   ├── shipment.controller.ts
│   │   │   ├── shipment.repository.ts
│   │   │   ├── shipment.routes.ts
│   │   │   ├── shipment.service.ts
│   │   │   └── shipment.validation.ts
│   │   ├── dashboard/
│   │   │   ├── dashboard.controller.ts
│   │   │   ├── dashboard.routes.ts
│   │   │   └── dashboard.service.ts
│   │   └── chat/
│   │       ├── ai.provider.ts       AIProvider interface + ChatMessage type
│   │       ├── chat.controller.ts
│   │       ├── chat.repository.ts
│   │       ├── chat.routes.ts
│   │       ├── chat.service.ts
│   │       ├── chat.validation.ts
│   │       ├── mock.provider.ts     Deterministic offline provider
│   │       └── ollama.provider.ts   Local LLM provider
│   ├── types/
│   │   ├── common.types.ts      ApiResponse<T> envelope type
│   │   └── express.d.ts         Request.user augmentation
│   ├── utils/
│   │   └── logger.ts            Winston logger
│   ├── app.ts                   Express app + route mounting
│   └── server.ts                HTTP server + Socket.IO bootstrap
├── generated/prisma/            Generated Prisma client (output dir)
├── package.json
└── tsconfig.json
```

### 5.2 Frontend (`frontend/`) - intended layout

```text
frontend/
├── src/
│   ├── api/                     Axios client + API modules (auth, customers, ...)
│   ├── components/              Shared UI components (layout, tables, forms, charts)
│   ├── context/                 Auth context / provider
│   ├── hooks/                   TanStack Query hooks + socket hook
│   ├── pages/                   Dashboard, Customers, Shipments, Analytics, Chat, Login
│   ├── routes/                  ProtectedRoute and route definitions
│   ├── types/                   Shared TypeScript types
│   ├── utils/                   Helpers (formatting, socket client)
│   ├── App.tsx                  App shell + routing
│   ├── index.css                Tailwind entry stylesheet
│   └── main.tsx                 Entry point
├── package.json
├── tailwind.config.*            Tailwind configuration (if used)
├── tsconfig.json
└── vite.config.ts
```

### 5.3 Analytics service (`analytics-service/`)

```text
analytics-service/
├── app/
│   ├── __init__.py              Flask app factory (create_app) + error handlers
│   ├── config.py                Config class (PORT, MAX_FILE_SIZE_MB, CORS_ORIGIN)
│   ├── routes/
│   │   └── analytics.routes.py  Blueprint: GET /health, POST /analyze
│   ├── services/
│   │   └── analytics.service.py Pure Pandas + Plotly logic (no Flask imports)
│   └── utils/
│       ├── errors.py            success_response / error_response envelope
│       └── validation.py        REQUIRED_COLUMNS, ValidationError, file helpers
├── run.py                       Local entry point (port 5001)
├── requirements.txt             flask, flask-cors, pandas, plotly, gunicorn, pytest
├── sample_data/
│   └── sales_sample.csv
└── tests/
    └── test_analytics.py        pytest suite
```

---

## 6. WebSocket event flow

Socket.IO is initialized in `server.ts` via `initializeSocket(httpServer)`. The same HTTP server
that serves the REST API also serves the WebSocket endpoint, so there is one port to configure,
expose and secure.

Sequence for a shipment status change:

```text
Client A (SPA)                        Backend API                         Client B (SPA)
     |                                     |                                    |
     |  PATCH /shipments/:id/status        |                                    |
     |  { status: "Delivered" }            |                                    |
     |------------------------------------>|                                    |
     |                                     | authenticate -> validate           |
     |                                     | service.updateShipmentStatus       |
     |                                     |   repository.updateStatus          |
     |                                     |   (PostgreSQL UPDATE commits)      |
     |                                     |                                    |
     |                                     | io.emit("shipment_status_changed", |
     |                                     |   { event, shipmentId,             |
     |                                     |     trackingNumber, previousStatus,|
     |                                     |     status, updatedAt })           |
     |                                     |----------------------------------->|  (broadcast to
     |<------------------------------------|                                    |   authenticated clients)
     |  200 { success:true, data:<shipment>|                                    |
     |                                     |                                    |
     |  UI updates live                    |                                    |  UI updates live
```

Event reference (see also [API_DOCUMENTATION.md](API_DOCUMENTATION.md)):

- **Event name:** `shipment_status_changed`
- **Direction:** server -> all authenticated connected clients (broadcast)
- **Payload:**

```json
{
  "event": "shipment_status_changed",
  "shipmentId": "clx1abc2d0000...",
  "trackingNumber": "TRK-2026-001",
  "previousStatus": "InTransit",
  "status": "Delivered",
  "updatedAt": "2026-11-16T10:22:31.000Z"
}
```

Design notes:

- The event is emitted **only after** the database update succeeds, so a client never sees a
  change that was not persisted.
- The emit is wrapped in a `try/catch` so a not-yet-initialized socket server cannot break the
  HTTP response (the update still succeeds).
- `connection` and `disconnect` are handled and logged.
- **Production hardening:** for horizontal scaling, add the **Socket.IO Redis adapter** so an event
  emitted on one instance reaches clients connected to another instance. This requires a shared
  Redis instance and is intentionally out of scope here.

---

## 7. AI chat flow and provider abstraction

The chat module lives inside the API (`modules/chat/`) and exposes:

- `POST /api/v1/chat` - `{ conversationId: string | null, message }`
- `GET /api/v1/chat/conversations` - the caller's conversations
- `GET /api/v1/chat/:conversationId/messages` - messages in a conversation

Conversations are **scoped to the authenticated user**: a conversation can only be read or
appended to by its owner.

### Flow

```text
POST /chat { conversationId, message }
  -> authenticate (userId)
  -> validate(sendMessageSchema)
  -> chatService.sendMessage(userId, conversationId, message)
       1. If conversationId is null -> create a new conversation (title = first 50 chars)
          else -> load the conversation and verify ownership (404 if not owned)
       2. Load the last 20 messages of the conversation from PostgreSQL
       3. Build the model input:
            [ { role: "system", content: SYSTEM_PROMPT },
              ...history (user/assistant),
              { role: "user", content: message } ]
       4. provider.generateResponse(messages)
       5. Persist the user and assistant messages together in one transaction
       6. Return { conversationId, message: <assistant message> }
```

The **system prompt** frames the assistant as an internal logistics operations helper and
instructs it never to invent customer or shipment details it does not have access to.

### Provider abstraction

```ts
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface AIProvider { generateResponse(messages: ChatMessage[]): Promise<string>; }
```

Three implementations ship with the project, selected by `AI_PROVIDER`:

| `AI_PROVIDER` | Implementation | Behaviour |
| --- | --- | --- |
| `mock` (default) | `MockAIProvider` | Deterministic, offline keyword-based replies. Used for demos and tests so the chat is reproducible without network/GPU. |
| `ollama` | `OllamaProvider` | Calls a local LLM through `OLLAMA_BASE_URL` (default `http://localhost:11434`) using `OLLAMA_MODEL` (default `qwen2.5:3b`). |
| `openai` | `OpenAIProvider` | Calls an OpenAI-compatible chat-completions endpoint using `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`; compatible with Azure OpenAI v1 endpoints. |

If a provider call fails, the service logs the provider error and returns `503 Service Unavailable`.
The user and assistant messages are persisted together only after a response is generated, so a
failed provider request neither creates a misleading reply nor leaves a partial turn in history.

**Extending:** implement the `AIProvider` interface in a new class and select it in `getProvider()`.
No other module changes are required because the abstraction is the only integration point.

---

## 8. Analytics service design

The analytics service is a stateless Flask application that turns a sales CSV into descriptive
analytics and charts.

```text
Client (SPA Analytics page)
   |  POST /analyze
   |  multipart/form-data, field "file"  (.csv, <= 5 MB)
   v
+----------------------------------------------+
| Flask (analytics-service, port 5001)         |
|   1. Validate: presence, extension, size,    |
|      required columns (salesperson,          |
|      revenue, region), numeric revenue       |
|   2. Load into a Pandas DataFrame            |
|   3. Compute:                                |
|        summary { totalRevenue,               |
|                  averageRevenue,             |
|                  highestSale, lowestSale,    |
|                  totalRecords,               |
|                  uniqueSalespeople,          |
|                  uniqueRegions }             |
|        revenueByRegion   [ {region, total} ] |
|        topSalespeople    [ {salesperson,     |
|                            totalRevenue} ]   |
|                            (top 5)           |
|   4. Build Plotly figures:                   |
|        charts.revenueByRegion                |
|        charts.topSalespeople                 |
+----------------------------------------------+
   |  200 { success:true, data:{ summary, revenueByRegion, topSalespeople, charts } }
   v
Client renders charts.revenueByRegion / charts.topSalespeople
```

Design properties:

- **Stateless** - no data is persisted between requests; every request is self-contained.
- **No database** - it never touches PostgreSQL; it operates purely on the uploaded file.
- **Descriptive only** - aggregation, ranking and plotting. No prediction, no training, no model
  artifacts.
- **Layered internally** - the HTTP blueprint (`routes/`) is separated from the pure business logic
  (`services/analytics.service.py`, which imports no Flask and is trivially unit-testable).
- **Shared error envelope** - validation failures and processing errors return
  `{ success: false, message, errors[] }`, consistent with the main API.

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for the exact request/response shapes.

---

## 9. Design decisions and trade-offs

### 9.1 Soft delete for customers (rather than hard delete)

**Decision:** `DELETE /api/v1/customers/:id` sets `Customer.deletedAt` instead of removing the row;
every customer query filters on `deletedAt: null`.

**Why:**

- **Referential integrity** - a customer can own many shipments. Hard-deleting the row would
  orphan or require cascading deletion of shipment history, which is operationally unacceptable.
- **Reversibility** - the record can be restored by clearing `deletedAt`.
- **Reporting integrity** - historical aggregates remain consistent.

**Trade-offs:**

- The unique `email` still occupies a row, so the address cannot be reused until `deletedAt` is
  cleared. This is the intended behaviour for an internally managed directory.
- Every read path must remember to filter `deletedAt`; this is centralised in the repository
  (`findAll` builds `where: { deletedAt: null }`, `findById` uses
  `findFirst({ where: { id, deletedAt: null } })`).
- Shipments are *not* soft deleted - they are shared operational records.

### 9.2 Service and repository layering

**Decision:** split controller -> service -> repository, even though the modules are small.

**Why:**

- **Testability** - business rules live in services with no HTTP coupling; data access lives in
  repositories with no business coupling.
- **Single responsibility** - a controller changes only when the HTTP contract changes; a service
  changes only when a business rule changes; a repository changes only when the query changes.
- **Consistency** - every module follows the same shape, which makes the codebase predictable for
  reviewers and future maintainers.

**Trade-offs:**

- More files and a little indirection (a "layer tax") for simple endpoints. The `auth` module
  demonstrates that the pattern can be lightened where a repository adds nothing.
- The structure pays off the moment a new data source, cache or side effect (such as the Socket.IO
  emit) must be added in exactly one place: the service.

### 9.3 AI provider abstraction

**Decision:** define a one-method `AIProvider` interface and select an implementation by
environment variable.

**Why:**

- **Determinism** - `mock` gives reproducible demos and tests without a network dependency, GPU or
  model download.
- **Portability** - select the existing mock, Ollama or OpenAI-compatible provider through
  `AI_PROVIDER`; the chat service and repository remain provider-independent.
- **Failure handling** - provider failures are logged and returned as `503`; the service does not
  silently substitute a mock answer or persist an incomplete turn.

**Trade-offs:**

- The abstraction is deliberately minimal (no streaming, no tool-calling, no token accounting).
  That keeps it honest for the current scope but means streaming responses would require extending
  the interface.

### 9.4 No RAG, no embeddings, no vector database

**Decision:** the assistant replays a bounded window (last 20) of conversation history to a chat
provider. There is no retrieval layer.

**Why not RAG here:**

- RAG and vector databases exist to give a model access to a large, changing, **external** corpus
  (documents, knowledge bases, catalogues) that cannot fit in a prompt. That means adding an
  embedding model, a vector store, a chunking/indexing pipeline and a retrieval step - real
  operational complexity.
- LogiOps does not have that problem. The assistant answers questions about a **fixed, small
  domain model** (customers, shipments, statuses, platform usage), not an open corpus.
- **Operational facts live in PostgreSQL** and are best served by deterministic queries, not
  semantic similarity search. If the assistant needed to answer a data question ("how many
  shipments are in transit?"), the correct approach is a tool/function call into the existing
  dashboard aggregation - **not** embeddings.
- **Conversation context is bounded**: replaying the last 20 messages is sufficient for continuity.

RAG/vector search would only become justified if the product later required free-form questions
over a large unstructured document set (contracts, policy manuals). That is explicitly out of
scope.

### 9.5 No Redis (yet)

**Decision:** do not introduce Redis. Realtime fan-out is instance-local.

**Why:**

- The system currently runs as a single backend instance. A single Express process broadcasting via
  Socket.IO to its own connections is correct and requires no extra infrastructure.
- Redis would add an operational dependency (a managed cache, connection handling, failure modes)
  before there is a demonstrated need.

**Trade-off / when it changes:** the moment the backend scales to **more than one instance**, an
event emitted on instance A will not reach clients connected to instance B. At that point the
**Socket.IO Redis adapter** becomes mandatory for correct realtime behaviour. Until then, run a
single instance, or accept instance-local delivery. This is documented in code comments and here,
but intentionally not implemented.

### 9.6 Other smaller decisions

- **Zod for validation** at the edge (a middleware) means controllers receive already-typed,
  already-validated bodies and services can trust their inputs.
- **`AppError` + a single error handler** centralises HTTP error mapping, including translating
  Prisma's `P2002` unique-constraint violation into a 409.
- **A single `ApiResponse` envelope** (`{ success, message, data, meta?, errors? }`) across the API
  and a matching envelope in the analytics service keeps clients simple.

---

## 10. Scalability and deployment topology

### Current (development) topology

```text
localhost:5173  React SPA (Vite dev server)
localhost:5000  Express API + Socket.IO
localhost:5001  Flask analytics service
localhost:5433  PostgreSQL 18 (Docker)
```

### Scaling considerations

- **Backend API** - stateless per request; it can be scaled horizontally behind a load balancer
  (for example Azure App Service scale-out). The one stateful concern is Socket.IO fan-out: an
  event emitted on instance A does not reach clients connected to instance B until the **Socket.IO
  Redis adapter** is added. Until then, run a single instance.
- **Database** - a single PostgreSQL instance is sufficient at this scale. Managed PostgreSQL
  (Azure Database for PostgreSQL) provides backups, HA and read replicas if read load grows.
- **Analytics service** - stateless and CPU-bound per request; scale horizontally behind the
  platform's load balancer. File size is bounded (5 MB) to cap per-request memory and CPU.
- **Frontend** - static assets; deploy to a CDN / static host (for example Azure Static Web Apps).

### Documented Azure target topology

The intended production topology (documented, not deployed - see
[AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md)):

```text
Azure Static Web Apps (frontend)
        |
        v
Azure App Service (Linux) - Backend API + Socket.IO
        |                          \
        |  Private Endpoint         \  outbound to
        v                            v
Azure Database for PostgreSQL    Azure App Service (Linux) - Analytics service
(Flexible Server, private access)
        ^
        |
Azure Key Vault (secrets)   Microsoft Entra ID (identity; JWT is the implemented alternative)
        |
Application Insights (observability)
```

Key points:

- Backend and analytics are separate App Services so they can scale independently.
- The database is reachable only over a **Private Endpoint** inside the VNet; public access is
  disabled.
- Secrets are resolved from **Key Vault** via managed identity, never committed to the repo.
- **Application Insights** provides request/dependency telemetry and traces.
