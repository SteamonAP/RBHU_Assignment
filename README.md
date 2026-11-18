# Internal Logistics Operations Platform

This assignment is an internal operations management platform for a logistics company. It gives
authenticated staff a single console to manage **customers** and their **shipments**, watch a
**live operations dashboard**, upload **sales CSV data** for descriptive analytics, receive
**real-time shipment notifications**, and chat with an in-app **AI operations assistant**.

The project is structured as a monorepo of three independently runnable services plus a
Docker-managed PostgreSQL database:

- a typed REST + WebSocket API (**backend**),
- a single-page application (**frontend**),
- a CSV sales-analytics microservice (**analytics-service**).

> Scope note: this is a data-driven operations platform. There is deliberately **no machine
> learning, no model training, no embeddings, no vector database and no RAG** anywhere in the
> system. The AI assistant is a thin provider abstraction over a chat-completion call; the
> analytics service performs classic descriptive aggregation with Pandas and renders Plotly
> figures. See [Out of scope / not implemented](#out-of-scope--not-implemented).

---

## Table of contents

- [Business context](#business-context)
- [Modules](#modules)
- [Architecture](#architecture)
- [Repository structure](#repository-structure)
- [Technology stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Demo credentials](#demo-credentials)
- [Environment variables](#environment-variables)
- [Command reference](#command-reference)
- [API endpoint summary](#api-endpoint-summary)
- [WebSocket event summary](#websocket-event-summary)
- [Documentation index](#documentation-index)
- [Out of scope / not implemented](#out-of-scope--not-implemented)

---

## Business context

A mid-sized logistics company runs its freight operations internally. Dispatchers, account
managers and operations leads need a single authenticated tool to:

1. Maintain a directory of **customers** (the companies and contacts they ship for), with the
   ability to remove a customer from the active directory **without losing its shipment
   history**.
2. Track **shipments** end to end - `Pending` -> `PickedUp` -> `InTransit` -> `Delivered`, or
   `Cancelled` - each with a unique tracking number and a link back to the owning customer.
3. See an always-current **operational summary**: how many customers, how many shipments, and
   how shipments are distributed across statuses.
4. Receive **real-time notifications** when a shipment status changes, so a dispatcher watching
   the board sees updates instantly without refreshing.
5. Upload periodic **sales CSV exports** and get revenue-by-region and top-salespeople charts.
6. Ask an **internal AI assistant** questions about customers, shipments, tracking numbers and
   platform usage, with conversation context retained across turns.

Every authenticated employee can use the platform. The data model distinguishes `ADMIN` and
`USER` roles, and RBAC middleware (`authorize(...roles)`) is in place for future role-gating.

---

## Modules

1. **Authentication and RBAC** - email/password login, bcrypt password hashing, JWT bearer
   tokens, `authenticate` and `authorize` middleware.
2. **Customer management** - CRUD over customers with pagination, search and status filter, and
   **soft delete** (`deletedAt`) so shipment history is preserved.
3. **Shipment management** - CRUD over shipments with pagination, search, status/customer
   filters, an owning-customer relation, and a dedicated status-transition endpoint.
4. **Operations dashboard** - live totals (`totalCustomers`, `totalShipments`) and a status
   distribution computed with Prisma `count`/`groupBy`, never hardcoded.
5. **AI operations assistant (chat)** - a user-scoped conversation store plus a pluggable
   `AIProvider` (offline `mock` default, local Ollama, or OpenAI-compatible hosted endpoint).
6. **Sales analytics microservice** - a stateless Flask service that ingests a CSV and returns
   summary statistics, revenue by region and top salespeople. Flask also returns Plotly figure JSON;
   the dashboard renders the aggregate results with Recharts.

Real-time notification (Socket.IO) is a cross-cutting capability of the shipment module.

---

## Architecture

High-level component and data flow:

```text
                              HTTPS / REST (JSON)                    +------------------------------+
   +-------------------+  <==================================>       |   Express + TypeScript API   |
   |                   |                                             |   Node.js  -  port 5000      |
   |  React 19 SPA     |      Socket.IO (WebSocket, same port)       |   Base path: /api/v1         |
   |  Vite - :5173     |  <==================================>       |                              |
   |                   |                                             +--------------+---------------+
   +---------+---------+                                                            |
             |                                                                      |  Route -> validate -> Controller
             |  POST multipart/form-data (CSV)                                      |  -> Service -> Repository
             v                                                                      v
   +-------------------+                                             +--------------+---------------+
   | Flask analytics   |                                             |        Prisma ORM (client)   |
   | service :5001     |                                             +--------------+---------------+
   | Pandas + Plotly   |                                                            |
   +-------------------+                                                            v
                                                                        +---------------------------+
                                                                        |   PostgreSQL 18           |
                                                                        |   Docker: host port 5433  |
                                                                        |   database: assessment_db |
                                                                        +---------------------------+

   AI assistant (inside the API):
   Chat module -> AIProvider interface -> { mock (default, offline) | ollama (local LLM) | openai (OpenAI-compatible endpoint) }

   WebSocket (inside the API, same HTTP server):
   shipment status update -> DB commit -> io.emit("shipment_status_changed") -> SPA updates live
```

Request path inside the API, in order:

```text
HTTP request
  -> Express middleware chain (helmet, cors, json parser, morgan, rate limit)
  -> Route (module router, e.g. /api/v1/shipments)
  -> authenticate middleware (JWT Bearer)
  -> validate middleware (Zod schema parses req.body)
  -> Controller (shapes the { success, message, data } response)
  -> Service (business rules, throws AppError)
  -> Repository (Prisma data access)
  -> Prisma Client
  -> PostgreSQL
  -> response envelope back up the chain
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full component responsibilities, layering
rules, the request lifecycle, and the WebSocket / AI / analytics flows.

---

## Repository structure

```text
RBHU_FS/
├── backend/                       Node.js + Express + TypeScript API
│   ├── prisma/
│   │   ├── schema.prisma         Data model, enums, relations
│   │   └── seed.ts               Seeds admin user, customers and shipments
│   ├── src/
│   │   ├── config/               env.config.ts (typed environment)
│   │   ├── errors/               AppError class
│   │   ├── infrastructure/
│   │   │   ├── prisma/           Prisma client singleton
│   │   │   └── websocket/        Socket.IO server bootstrap
│   │   ├── middleware/           auth (authenticate/authorize), validate, error handling
│   │   ├── modules/
│   │   │   ├── auth/             controller / routes / service / validation
│   │   │   ├── customer/         controller / repository / routes / service / validation
│   │   │   ├── shipment/         controller / repository / routes / service / validation
│   │   │   ├── dashboard/        controller / routes / service
│   │   │   └── chat/             controller / repository / routes / service / validation
│   │   │                         + ai.provider.ts, mock.provider.ts, ollama.provider.ts
│   │   ├── types/                shared types + express request augmentation
│   │   ├── utils/                Winston logger
│   │   ├── app.ts                Express app and route mounting
│   │   └── server.ts             HTTP server + Socket.IO bootstrap
│   ├── package.json
│   └── tsconfig.json
├── frontend/                      React 19 + TypeScript + Vite SPA
│   ├── src/
│   │   ├── App.tsx               App shell, routing, providers
│   │   └── main.tsx              Entry point
│   ├── package.json
│   └── vite.config.ts
├── analytics-service/             Python 3.12 + Flask + Pandas + Plotly
│   ├── app/
│   │   ├── __init__.py           Flask app factory + error handlers
│   │   ├── config.py             PORT / MAX_FILE_SIZE_MB / CORS_ORIGIN
│   │   ├── routes/               analytics.routes.py (GET /health, POST /analyze)
│   │   ├── services/             analytics.service.py (Pandas + Plotly logic)
│   │   └── utils/                validation.py, errors.py (response envelope)
│   ├── run.py                    Local entry point (port 5001)
│   ├── requirements.txt
│   ├── sample_data/              sales_sample.csv
│   └── tests/                    pytest suite
├── docs/                          This documentation set
├── docker-compose.yml             PostgreSQL 18 container (host port 5433)
└── README.md
```

---

## Technology stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend framework | React 19 + TypeScript | Single-page application |
| Frontend build tool | Vite | Dev server on `http://localhost:5173` |
| Frontend routing | React Router | Protected routes + auth context |
| Frontend data/HTTP | Axios + TanStack Query | Server-state fetching and caching |
| Frontend charts | Recharts | Renders analytics aggregates returned by Flask |
| Realtime client | socket.io-client | Subscribes to server events |
| Styling | Tailwind CSS | Utility-first styling |
| Backend runtime | Node.js 20+ | TypeScript |
| Backend framework | Express | REST API, base path `/api/v1` |
| Backend ORM | Prisma Client | PostgreSQL provider |
| Database | PostgreSQL 18 (Docker) | Host port `5433` -> container `5432` |
| Validation | Zod | Per-module `*.validation.ts` schemas |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` | Bearer tokens; bcrypt hashing (cost 12) |
| Realtime | Socket.IO | Mounted on the same HTTP server/port |
| Logging | Winston | Structured server logs |
| HTTP hardening | helmet, cors, express-rate-limit, morgan | Security headers, CORS allow-list, throttling, request logs |
| Analytics service | Python 3.12 + Flask + Pandas + Plotly | CSV descriptive analytics on port `5001` |
| Container | Docker + Docker Compose | PostgreSQL only |
| Target cloud (documented) | Azure App Service / Static Web Apps / Database for PostgreSQL / Key Vault / Entra ID | Architecture only; no live deployment required |

---

## Prerequisites

- **Node.js 20+** and npm (backend and frontend)
- **Python 3.12** (analytics service)
- **Docker Desktop** (for the PostgreSQL 18 container), or any reachable PostgreSQL 18 instance
- **PowerShell** (commands below) or a bash shell (bash equivalents are provided in the setup guide)

---

## Quick start

### 1. Start PostgreSQL

```powershell
docker compose up -d postgres
```

This starts PostgreSQL 18 with `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres123`,
`POSTGRES_DB=assessment_db`, mapped to host port `5433`.

### 2. Backend

```powershell
cd backend
npm install
npx prisma generate
npx prisma migrate dev        # or: npx prisma db push
npm run db:seed               # seeds admin + sample customers/shipments
npm run dev                   # ts-node-dev on http://localhost:5000
```

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev                   # Vite dev server on http://localhost:5173
```

### 4. Analytics service

```powershell
cd analytics-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # PowerShell
pip install -r requirements.txt
python run.py                       # Flask on http://localhost:5001
```

```bash
# bash equivalent
cd analytics-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open `http://localhost:5173` and log in with the demo credentials below. Step-by-step
instructions, expected output and troubleshooting are in
[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md).

---

## Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | `admin@logiops.com` | `Admin@123` |

The seed script also creates sample customers (Acme Logistics, Global Shipping Co, Fast Freight
Ltd) and shipments (tracking numbers `TRK-2026-001` ... `TRK-2026-004`) for demonstration.

---

## Environment variables

### `backend/.env`

| Variable | Example / default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `NODE_ENV` | `development` | Runtime mode (affects logging/error detail) |
| `DATABASE_URL` | `postgresql://postgres:postgres123@127.0.0.1:5433/assessment_db?schema=public` | PostgreSQL connection string |
| `JWT_SECRET` | (long random string) | HMAC signing secret for access tokens |
| `JWT_EXPIRE` | `15m` | Access-token lifetime |
| `CORS_ORIGIN` | `http://localhost:5173` | Primary allowed CORS origin |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate-limit window (ms) for `/api/*` |
| `RATE_LIMIT_MAX_REQUESTS` | `1000` | Max requests per window per client |
| `AI_PROVIDER` | `mock` | `mock` (offline), `ollama` (local LLM) or `openai` (OpenAI-compatible endpoint) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama HTTP endpoint |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Ollama model name |
| `OPENAI_API_KEY` | (unset) | Secret key for OpenAI or a compatible hosted endpoint |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `OPENAI_MODEL` | `gpt-4o-mini` | Hosted chat-completion model or deployment name |

### `frontend/.env`

| Variable | Example | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:5000/api/v1` | Backend REST base URL |
| `VITE_SOCKET_URL` | `http://localhost:5000` | Socket.IO server URL |
| `VITE_ANALYTICS_API_URL` | `http://localhost:5001` | Analytics service base URL |

### `analytics-service/.env`

| Variable | Example / default | Purpose |
| --- | --- | --- |
| `PORT` | `5001` | Service port used by `run.py` |
| `MAX_FILE_SIZE_MB` | `5` | Maximum accepted CSV upload size |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |

---

## Command reference

| Service | Command | Description |
| --- | --- | --- |
| root | `docker compose up -d postgres` | Start PostgreSQL (host port 5433) |
| root | `docker compose down` | Stop the container (keeps the volume) |
| root | `docker compose down -v` | Stop and remove the volume (wipes data) |
| backend | `npm install` | Install dependencies |
| backend | `npx prisma generate` | Generate the Prisma client into `generated/prisma` |
| backend | `npx prisma migrate dev` | Create and apply a migration |
| backend | `npx prisma db push` | Sync the schema without creating a migration |
| backend | `npm run db:seed` | Seed the database (idempotent `upsert`) |
| backend | `npm run dev` | Run the API with `ts-node-dev` (hot reload) |
| backend | `npm run build` | Type-check and compile to `dist/` |
| backend | `npm start` | Run the compiled API (`node dist/server.js`) |
| frontend | `npm install` | Install dependencies |
| frontend | `npm run dev` | Run the Vite dev server |
| frontend | `npm run build` | Production build |
| frontend | `npm run lint` | Lint the frontend |
| frontend | `npm run preview` | Preview the production build |
| analytics | `python -m venv .venv` | Create a virtual environment |
| analytics | `pip install -r requirements.txt` | Install Python dependencies |
| analytics | `python run.py` | Run the Flask service (port 5001) |
| analytics | `python -m pytest tests -q` | Run the pytest suite |
| analytics | `gunicorn "app:create_app()" --bind 0.0.0.0:5001` | Run the production WSGI server |

---

## API endpoint summary

Base path: `/api/v1` (default port `5000`). Health check: `GET /health` (unauthenticated).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | No | Log in with `{ email, password }`, receive a JWT |
| GET | `/api/v1/auth/me` | Bearer | Return the authenticated user |
| GET | `/api/v1/customers` | Bearer | List customers (`page`, `limit`, `search`, `status`) |
| GET | `/api/v1/customers/:id` | Bearer | Get one customer |
| POST | `/api/v1/customers` | Bearer | Create a customer |
| PATCH | `/api/v1/customers/:id` | Bearer | Partially update a customer |
| DELETE | `/api/v1/customers/:id` | Bearer | Soft delete a customer (sets `deletedAt`) |
| GET | `/api/v1/shipments` | Bearer | List shipments (`page`, `limit`, `search`, `status`, `customerId`) |
| GET | `/api/v1/shipments/:id` | Bearer | Get one shipment |
| POST | `/api/v1/shipments` | Bearer | Create a shipment |
| PATCH | `/api/v1/shipments/:id/status` | Bearer | Update status (emits the socket event) |
| GET | `/api/v1/dashboard/summary` | Bearer | Live totals + status distribution |
| POST | `/api/v1/chat` | Bearer | Send a chat message |
| GET | `/api/v1/chat/conversations` | Bearer | List the caller's conversations |
| GET | `/api/v1/chat/:conversationId/messages` | Bearer | Get messages in a conversation |
| GET | `/health` | No | API liveness probe |
| GET | `/health` (analytics) | No | Analytics service liveness probe |
| POST | `/analyze` (analytics) | No | Upload a sales CSV (multipart field `file`) |

Full request/response detail, error codes and ready-to-run `curl` examples are in
[docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md).

---

## WebSocket event summary

The Socket.IO server runs on the same HTTP server and port as the REST API.

| Event | Direction | Payload |
| --- | --- | --- |
| `shipment_status_changed` | server -> all clients (broadcast) | `{ event, shipmentId, trackingNumber, previousStatus, status, updatedAt }` |

The event is emitted **only after** the database update succeeds, so clients never observe a
change that did not persist. Only clients authenticated during the Socket.IO handshake can
connect. The SPA subscribes, invalidates its queries and shows a toast. See
[docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) for the full catalogue.

---

## Documentation index

| Document | What it covers |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layered architecture, module responsibilities, request lifecycle, structure trees, design decisions and trade-offs |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Full Prisma schema, field-by-field tables, enums, relations, indexes, soft delete, Mermaid ER diagram |
| [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) | Every endpoint, envelope conventions, error-code table, WebSocket catalogue, analytics endpoints, curl examples |
| [docs/openapi.json](docs/openapi.json) | Machine-readable OpenAPI 3.1 specification for REST endpoints |
| [docs/AZURE_DEPLOYMENT.md](docs/AZURE_DEPLOYMENT.md) | Proposed Azure target architecture and deployment approach (documentation only) |
| [docs/SECURITY.md](docs/SECURITY.md) | Auth, hashing, validation, CORS/helmet, rate limiting, secrets, injection safety, hardening checklist |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | Step-by-step local setup, troubleshooting table, verification checklist |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | Timed 10-15 minute walkthrough script with sample data |

---

## Out of scope / not implemented

The following are intentionally **not** implemented and are not claimed as features anywhere in
the codebase:

| Item | Status | Notes |
| --- | --- | --- |
| **Microsoft Fabric readiness** | Not implemented | No OneLake/Fabric integration, no Fabric-ready semantic model or data pipeline is produced. Reporting is limited to the in-app dashboard and the CSV analytics endpoint. |
| **Voice agent** | Not implemented | The AI assistant is text-only (`POST /api/v1/chat`). There is no speech-to-text, text-to-speech or telephony integration. |
| **SharePoint `/announcements`** | Not implemented | No SharePoint or announcements integration exists; there is no announcements module or `/announcements` route. |
| **Kaleido PNG export** | Not implemented | The analytics service returns Plotly **figure JSON only**. Server-side static image export (e.g. via Kaleido) is deliberately excluded. |
| **Real Azure deployment** | Not performed | [docs/AZURE_DEPLOYMENT.md](docs/AZURE_DEPLOYMENT.md) describes a *proposed* architecture. Development and demos use the local Docker PostgreSQL container. |
| Machine learning / model training | Not implemented | The platform performs deterministic aggregation and rule-based logic only. |
| Embeddings / vector DB / RAG | Not implemented | The assistant replays a bounded window (last 20) of stored messages to a chat provider; there is no retrieval layer. |
| Socket.IO Redis adapter | Not implemented | Horizontal realtime fan-out across multiple API instances is a documented future step. |
| Refresh-token endpoint | Not implemented | `REFRESH_TOKEN_EXPIRE` exists in configuration, but no token-refresh endpoint is exposed. |
