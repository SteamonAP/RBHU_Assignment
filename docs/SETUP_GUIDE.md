# LogiOps - Setup Guide

Step-by-step instructions to stand up the full LogiOps stack on a local development machine:
PostgreSQL (Docker), the backend API, the frontend SPA, and the analytics service. Includes a
troubleshooting table and a verification checklist with expected output.

Commands are given for **Windows PowerShell** with bash equivalents where they differ.

---

## Table of contents

- [1. Prerequisites](#1-prerequisites)
- [2. Clone the repository](#2-clone-the-repository)
- [3. Database (Docker Compose)](#3-database-docker-compose)
- [4. Backend (install / migrate / seed / run)](#4-backend-install--migrate--seed--run)
- [5. Frontend (install / run)](#5-frontend-install--run)
- [6. Analytics service (install / run)](#6-analytics-service-install--run)
- [7. Environment files](#7-environment-files)
- [8. Troubleshooting](#8-troubleshooting)
- [9. Verification checklist](#9-verification-checklist)

---

## 1. Prerequisites

| Tool | Version | Used by | Check command |
| --- | --- | --- | --- |
| Node.js | 20+ (LTS) | backend, frontend | `node -v` |
| npm | bundled with Node | backend, frontend | `npm -v` |
| Python | 3.12 | analytics service | `python --version` |
| Docker Desktop | current | PostgreSQL container | `docker --version` |
| Git | any | cloning | `git --version` |

Optional: a REST client (curl, Postman, Insomnia) and a PostgreSQL client (`psql`) for inspection.

---

## 2. Clone the repository

```powershell
git clone <repository-url>
cd RBHU_FS
```

```bash
# bash equivalent
git clone <repository-url>
cd RBHU_FS
```

The repository root contains `backend/`, `frontend/`, `analytics-service/`, `docs/` and
`docker-compose.yml`.

---

## 3. Database (Docker Compose)

Start PostgreSQL 18 (mapped to host port `5433`):

```powershell
docker compose up -d postgres
```

Expected output (abridged):

```text
[+] Running 2/2
 ✔ Network rbhu_fs_assessment-network  Created
 ✔ Container assessment-postgres       Started
```

Confirm it is running and accepting connections:

```powershell
docker ps --filter "name=assessment-postgres"
docker compose logs postgres
```

Expected log lines include `database system is ready to accept connections`.

Connection details:

| Setting | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5433` (host) -> `5432` (container) |
| User | `postgres` |
| Password | `postgres123` |
| Database | `assessment_db` |

Stop the database (keeps data):

```powershell
docker compose down
```

Stop and wipe data (removes the volume):

```powershell
docker compose down -v
```

---

## 4. Backend (install / migrate / seed / run)

```powershell
cd backend
npm install
```

Create `backend/.env` (see [section 7](#7-environment-files)). Then generate the Prisma client and
apply the schema:

```powershell
npx prisma generate            # generates the client into backend/generated/prisma
npx prisma migrate dev         # creates/applies a migration (or: npx prisma db push)
```

Seed demo data:

```powershell
npm run db:seed
```

Expected output:

```text
Seeding...
Admin: admin@logiops.com
Customers seeded
Shipments seeded
Done! Login: admin@logiops.com / Admin@123
```

Run the API (hot reload):

```powershell
npm run dev
```

Expected output (structured Winston logs):

```text
Database connected
LogiOps server on port 5000
API: http://localhost:5000/api/v1
```

Production build and run (optional):

```powershell
npm run build      # tsc -> dist/
npm start          # node dist/server.js
```

---

## 5. Frontend (install / run)

```powershell
cd frontend
npm install
```

Create `frontend/.env` (see [section 7](#7-environment-files)). Then:

```powershell
npm run dev
```

Expected output:

```text
VITE v7.x.x  ready in ... ms
➜  Local:   http://localhost:5173/
```

Open `http://localhost:5173` and log in with `admin@logiops.com` / `Admin@123`.

Production build and preview (optional):

```powershell
npm run build
npm run preview
```

---

## 6. Analytics service (install / run)

```powershell
cd analytics-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # PowerShell
pip install -r requirements.txt
python run.py
```

```bash
# bash equivalent
cd analytics-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Expected output:

```text
 * Running on http://0.0.0.0:5001
 * Running on http://127.0.0.1:5001
```

Production-style run (optional):

```powershell
gunicorn "app:create_app()" --bind 0.0.0.0:5001
```

Run the tests:

```powershell
python -m pytest tests -q
```

The service reads `PORT`, `MAX_FILE_SIZE_MB` and `CORS_ORIGIN` from the environment; copy
`.env.example` to `.env` only as a reminder of the keys (the code reads real environment variables).

---

## 7. Environment files

### `backend/.env`

```dotenv
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres123@127.0.0.1:5433/assessment_db?schema=public"
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRE=15m
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
AI_PROVIDER=mock
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

- Use `AI_PROVIDER=mock` for an offline, deterministic assistant. Set `AI_PROVIDER=ollama` only if
  you have a local Ollama server running.
- Set `AI_PROVIDER=openai` and configure the hosted AI variables to use OpenAI or a compatible
  endpoint such as Azure OpenAI v1.
- Outside production, an unset `JWT_SECRET` uses a development fallback. Production startup
  requires an explicitly configured secret of at least 32 characters.

### `frontend/.env`

```dotenv
VITE_API_URL=http://localhost:5000/api/v1
VITE_SOCKET_URL=http://localhost:5000
VITE_ANALYTICS_API_URL=http://localhost:5001
```

### `analytics-service/.env` (optional; defaults shown)

```dotenv
PORT=5001
MAX_FILE_SIZE_MB=5
CORS_ORIGIN=http://localhost:5173
```

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| **Port in use** - `EADDRINUSE :::5000` (or 5173 / 5001) | Another process already listens on the port | Find and stop it, or change the port. Windows: `netstat -ano \| findstr :5000` then `taskkill /PID <pid> /F`. Change `PORT` in `backend/.env`; Vite picks another port automatically. |
| **Prisma client not generated** - `Cannot find module '../generated/prisma'` or type errors on `PrismaClient` | Client not generated (or generated to a stale output) | `cd backend; npx prisma generate`. The client output is `backend/generated/prisma` (per `schema.prisma`), not the default location. |
| **DB connection refused** - `Can't reach database server at 127.0.0.1:5433` | PostgreSQL container not running / wrong port | `docker compose up -d postgres`; confirm with `docker ps`. Verify `DATABASE_URL` uses port `5433`. Check `docker compose logs postgres`. |
| **`P1000` / auth failed on migrate** | Wrong credentials in `DATABASE_URL` | Confirm user `postgres`, password `postgres123`, database `assessment_db`, host `127.0.0.1`, port `5433`. |
| **Schema out of sync** - queries fail with "table does not exist" | Migrations not applied | `npx prisma migrate dev` (or `npx prisma db push`), then `npm run db:seed`. |
| **Socket not connecting** | Wrong `VITE_SOCKET_URL`, or backend CORS/socket origin mismatch | Ensure `VITE_SOCKET_URL=http://localhost:5000` and the backend is running. The socket CORS allows `CORS_ORIGIN`, `http://localhost:5173`, `http://localhost:3000` - serve the SPA from one of these origins. Check the backend log for `Socket connected: <id>`. |
| **CORS errors in the browser** | SPA origin not in the backend allow-list, or wrong API URL | Set `CORS_ORIGIN` to the SPA origin (default `http://localhost:5173`) and `VITE_API_URL` to the API base. Restart the backend after changing env. |
| **`401` immediately after login** | Token not attached, or expired | Ensure requests send `Authorization: Bearer <accessToken>`. Tokens expire after `JWT_EXPIRE` (15m) - log in again. |
| **Python deps fail to install** - build errors on `pandas`/`plotly` | Wrong Python version or missing build tools | Use Python 3.12; upgrade pip (`python -m pip install --upgrade pip`); recreate the venv (`Remove-Item -Recurse -Force .venv` then re-create). |
| **`.venv\Scripts\Activate.ps1` blocked** | PowerShell execution policy | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in the session, or use `.\.venv\Scripts\activate.bat`. |
| **Analytics `400` / file-size validation error** | CSV exceeds `MAX_FILE_SIZE_MB` | Use a smaller file or raise `MAX_FILE_SIZE_MB` and restart the service. |
| **Analytics `422` missing column** | CSV header does not contain `salesperson,revenue,region` | Fix the header row; extra columns are ignored but the three required columns must be present. |
| **`npm ci` fails on a fresh clone** | Lockfile/registry issue | Run `npm install` instead, or ensure `package-lock.json` is present and Node/npm versions match. |

---

## 9. Verification checklist

Run these in order after starting all services. "Expected" shows the essential shape of the output.

### 9.1 Infrastructure

```powershell
docker ps --filter "name=assessment-postgres"
```

Expected: one running container `assessment-postgres` with `0.0.0.0:5433->5432/tcp`.

### 9.2 Backend health

```powershell
curl http://localhost:5000/health
```

Expected:

```json
{ "success": true, "message": "LogiOps API running", "version": "1.0.0" }
```

### 9.3 Login and token

```powershell
curl -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@logiops.com\",\"password\":\"Admin@123\"}"
```

Expected: `"success": true` and a non-empty `accessToken`. Copy the token for the next steps.

### 9.4 Authenticated endpoints

```powershell
curl http://localhost:5000/api/v1/dashboard/summary -H "Authorization: Bearer <accessToken>"
curl "http://localhost:5000/api/v1/customers?page=1&limit=10" -H "Authorization: Bearer <accessToken>"
curl "http://localhost:5000/api/v1/shipments?page=1&limit=10" -H "Authorization: Bearer <accessToken>"
```

Expected:

- Dashboard: `totalCustomers` = 3, `totalShipments` = 4, and a `shipmentStatusDistribution` with all
  five status keys.
- Customers: `meta.total` = 3 and three customer records.
- Shipments: `meta.total` = 4 with `TRK-2026-001` ... `TRK-2026-004`.

### 9.5 Frontend

- Open `http://localhost:5173`, log in with `admin@logiops.com` / `Admin@123`.
- The Dashboard shows the live totals; Customers and Shipments lists populate.
- Open a second browser tab/window. In tab 1 change a shipment's status; tab 2 should show the
  realtime update (toast / refreshed data) without a manual refresh.

### 9.6 Analytics service

```powershell
curl http://localhost:5001/health
curl -X POST http://localhost:5001/analyze -F "file=@analytics-service/sample_data/sales_sample.csv"
```

Expected:

- Health: `{ "success": true, "message": "Analytics service is healthy", "data": { "status": "ok", ... } }`.
- Analyze: `"success": true` with `summary.totalRevenue` = 72000, `summary.totalRecords` = 6,
  `revenueByRegion` (East/North/West) and `topSalespeople` (Jane/John/David).

### 9.7 Analytics tests

```powershell
cd analytics-service
python -m pytest tests -q
```

Expected: all tests pass (summary metrics, top-5 limit, and each validation rejection case).

### 9.8 Backend build

```powershell
cd backend
npm run build
```

Expected: no TypeScript errors; output is produced in `backend/dist/`.
