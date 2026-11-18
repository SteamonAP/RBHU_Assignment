# LogiOps - API Documentation

Complete reference for the LogiOps backend REST API, the Socket.IO event catalogue, and the
Python analytics service endpoints.

The machine-readable OpenAPI 3.1 specification is in
[openapi.json](./openapi.json).

- Backend base URL (dev): `http://localhost:5000`
- Backend API base path: `/api/v1`
- Backend health probe: `GET /health`
- Analytics service base URL (dev): `http://localhost:5001`

---

## Table of contents

- [1. Conventions](#1-conventions)
- [2. Response envelope](#2-response-envelope)
- [3. Authentication](#3-authentication)
- [4. Status and error codes](#4-status-and-error-codes)
- [5. Auth endpoints](#5-auth-endpoints)
- [6. Customer endpoints](#6-customer-endpoints)
- [7. Shipment endpoints](#7-shipment-endpoints)
- [8. Dashboard endpoints](#8-dashboard-endpoints)
- [9. Chat endpoints](#9-chat-endpoints)
- [10. Health endpoint](#10-health-endpoint)
- [11. WebSocket event catalogue](#11-websocket-event-catalogue)
- [12. Analytics service endpoints](#12-analytics-service-endpoints)

---

## 1. Conventions

- All request and response bodies are JSON (`Content-Type: application/json`), except
  `POST /api/v1/chat` (JSON) and the analytics `POST /analyze` (multipart/form-data).
- All protected endpoints require the header `Authorization: Bearer <accessToken>`.
- Pagination is 1-based. `page` defaults to `1`; `limit` defaults to `10` and is capped at `100`.
- IDs are Prisma `cuid()` strings.
- The analytics service uses the same response envelope as the backend.

### curl notes

The examples below use bash-style quoting. In **PowerShell**, prefer `curl.exe` and single-quote
the JSON payload, e.g.:

```powershell
curl.exe -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@logiops.com","password":"Admin@123"}'
```

---

## 2. Response envelope

Every backend and analytics response uses one of two shapes.

**Success:**

```json
{
  "success": true,
  "message": "Customers retrieved",
  "data": {},
  "meta": { "page": 1, "limit": 10, "total": 3, "totalPages": 1 }
}
```

- `message` - human-readable summary.
- `data` - the payload (object or array). Absent on some responses (e.g. `DELETE`).
- `meta` - present only on paginated list endpoints (`page`, `limit`, `total`, `totalPages`).

**Error:**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [ { "field": "email", "message": "Invalid email" } ]
}
```

- `errors` - present for validation failures (Zod) and analytics validation errors; omitted
  otherwise.

> Note: the chat endpoints return `{ "success": true, "data": ... }` **without** a `message` field.

---

## 3. Authentication

- Login with `POST /api/v1/auth/login` to receive an `accessToken`.
- Send it on every protected request as `Authorization: Bearer <accessToken>`.
- Tokens are HS256 JWTs signed with `JWT_SECRET` and expiring after `JWT_EXPIRE` (default `15m`).
- The `authenticate` middleware re-loads the user from the database on every request, so a token
  for a deleted user is rejected (`401 User no longer exists.`).
- RBAC is available via `authorize(...roles)`; it returns `403 Forbidden.` when the role does not
  match. (No route currently restricts by role - all authenticated users may call the endpoints
  below.)

---

## 4. Status and error codes

| Code | Meaning | Typical trigger |
| --- | --- | --- |
| `200` | OK | Successful read/update; successful login |
| `201` | Created | `POST /customers`, `POST /shipments` |
| `400` | Bad Request | Malformed request / missing file part (analytics) |
| `401` | Unauthorized | Missing/invalid/expired token; bad credentials |
| `403` | Forbidden | Authenticated but role not permitted |
| `404` | Not Found | Unknown route, or entity not found / soft-deleted |
| `409` | Conflict | Duplicate unique value (Prisma `P2002`): email or tracking number |
| `422` | Unprocessable Entity | Zod validation failure / analytics validation error |
| `429` | Too Many Requests | Rate limit exceeded on `/api/*` |
| `500` | Internal Server Error | Unhandled server error |

Representative error bodies:

```json
{ "success": false, "message": "Authentication required. Please login." }
```

```json
{ "success": false, "message": "Invalid token." }
```

```json
{ "success": false, "message": "Token expired." }
```

```json
{ "success": false, "message": "Forbidden." }
```

```json
{ "success": false, "message": "Customer not found" }
```

```json
{ "success": false, "message": "Duplicate email value." }
```

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [ { "field": "email", "message": "Invalid email" } ]
}
```

In development (`NODE_ENV=development`) unhandled errors return the underlying message; in
production they return `{ "success": false, "message": "Internal server error" }`.

---

## 5. Auth endpoints

### 5.1 `POST /api/v1/auth/login`

Authenticate with email and password. Public.

**Request body** (`application/json`):

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `email` | string | Yes | Valid email format |
| `password` | string | Yes | Minimum length 1 |

```json
{ "email": "admin@logiops.com", "password": "Admin@123" }
```

**Success `200`:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { "id": "clx...", "name": "Admin User", "email": "admin@logiops.com", "role": "ADMIN" },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
  }
}
```

**Errors:** `401` invalid credentials; `422` validation failure.

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@logiops.com","password":"Admin@123"}'
```

### 5.2 `GET /api/v1/auth/me`

Return the authenticated user. Requires Bearer token.

**Success `200`:**

```json
{
  "success": true,
  "message": "User retrieved",
  "data": {
    "user": {
      "id": "clx...",
      "name": "Admin User",
      "email": "admin@logiops.com",
      "role": "ADMIN",
      "createdAt": "2026-11-16T08:00:00.000Z"
    }
  }
}
```

**Errors:** `401` missing/invalid/expired token.

```bash
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

---

## 6. Customer endpoints

All customer endpoints require a Bearer token. Soft-deleted customers are excluded from all reads.

### 6.1 `GET /api/v1/customers`

List customers (excluding soft-deleted) with pagination, search and status filter.

**Query parameters:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer | `1` | Minimum 1 |
| `limit` | integer | `10` | Capped at 100 |
| `search` | string | - | Case-insensitive match across `name`, `email`, `company` |
| `status` | string | - | `Active` or `Inactive` |

**Success `200`:**

```json
{
  "success": true,
  "message": "Customers retrieved",
  "data": [
    {
      "id": "clx...",
      "name": "John Smith",
      "email": "john@acmelogistics.com",
      "company": "Acme Logistics",
      "status": "Active",
      "createdAt": "2026-11-16T08:00:00.000Z",
      "updatedAt": "2026-11-16T08:00:00.000Z",
      "deletedAt": null
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 3, "totalPages": 1 }
}
```

```bash
curl "http://localhost:5000/api/v1/customers?page=1&limit=10&search=acme&status=Active" \
  -H "Authorization: Bearer <accessToken>"
```

### 6.2 `GET /api/v1/customers/:id`

Get one customer by id.

**Success `200`:**

```json
{
  "success": true,
  "message": "Customer retrieved",
  "data": {
    "id": "clx...",
    "name": "John Smith",
    "email": "john@acmelogistics.com",
    "company": "Acme Logistics",
    "status": "Active",
    "createdAt": "2026-11-16T08:00:00.000Z",
    "updatedAt": "2026-11-16T08:00:00.000Z",
    "deletedAt": null
  }
}
```

**Errors:** `404` `Customer not found`.

```bash
curl http://localhost:5000/api/v1/customers/<customerId> \
  -H "Authorization: Bearer <accessToken>"
```

### 6.3 `POST /api/v1/customers`

Create a customer.

**Request body:**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | Yes | 2-100 chars |
| `email` | string | Yes | Valid email, unique |
| `company` | string | Yes | 2-150 chars |
| `status` | string | No | `Active` \| `Inactive` (default `Active`) |

```json
{ "name": "Priya Sharma", "email": "priya@swiftcargo.com", "company": "Swift Cargo", "status": "Active" }
```

**Success `201`:** `data` = the created customer (same shape as 6.2).

**Errors:** `409` duplicate email; `422` validation failure.

```bash
curl -X POST http://localhost:5000/api/v1/customers \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Priya Sharma","email":"priya@swiftcargo.com","company":"Swift Cargo","status":"Active"}'
```

### 6.4 `PATCH /api/v1/customers/:id`

Partially update a customer. All fields optional; only provided fields change.

**Request body:**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | No | 2-100 chars |
| `email` | string | No | Valid email, unique |
| `company` | string | No | 2-150 chars |
| `status` | string | No | `Active` \| `Inactive` |

```json
{ "status": "Inactive" }
```

**Success `200`:** `message` `Customer updated`, `data` = the updated customer.

**Errors:** `404` `Customer not found`; `409` duplicate email; `422` validation failure.

```bash
curl -X PATCH http://localhost:5000/api/v1/customers/<customerId> \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"status":"Inactive"}'
```

### 6.5 `DELETE /api/v1/customers/:id`

Soft delete a customer (sets `deletedAt`). No request body.

**Success `200`:**

```json
{ "success": true, "message": "Customer deleted" }
```

**Errors:** `404` `Customer not found`.

After deletion the customer no longer appears in list/detail responses or in the dashboard total.

```bash
curl -X DELETE http://localhost:5000/api/v1/customers/<customerId> \
  -H "Authorization: Bearer <accessToken>"
```

---

## 7. Shipment endpoints

All shipment endpoints require a Bearer token. List and create responses include a customer
summary.

### 7.1 `GET /api/v1/shipments`

List shipments with pagination, search and filters. Each item includes a nested customer summary
(`id`, `name`, `company`).

**Query parameters:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer | `1` | Minimum 1 |
| `limit` | integer | `10` | Capped at 100 |
| `search` | string | - | Case-insensitive match across `trackingNumber`, `origin`, `destination` |
| `status` | string | - | `Pending` \| `PickedUp` \| `InTransit` \| `Delivered` \| `Cancelled` |
| `customerId` | string | - | Filter to one customer |

**Success `200`:**

```json
{
  "success": true,
  "message": "Shipments retrieved",
  "data": [
    {
      "id": "clx...",
      "trackingNumber": "TRK-2026-001",
      "customerId": "clx...",
      "origin": "Mumbai",
      "destination": "Delhi",
      "status": "InTransit",
      "createdAt": "2026-11-16T08:00:00.000Z",
      "updatedAt": "2026-11-16T08:00:00.000Z",
      "customer": { "id": "clx...", "name": "John Smith", "company": "Acme Logistics" }
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 4, "totalPages": 1 }
}
```

```bash
curl "http://localhost:5000/api/v1/shipments?page=1&limit=10&status=InTransit" \
  -H "Authorization: Bearer <accessToken>"
```

### 7.2 `GET /api/v1/shipments/:id`

Get one shipment. The nested `customer` includes `id`, `name`, `email`, `company`.

**Success `200`:**

```json
{
  "success": true,
  "message": "Shipment retrieved",
  "data": {
    "id": "clx...",
    "trackingNumber": "TRK-2026-001",
    "customerId": "clx...",
    "origin": "Mumbai",
    "destination": "Delhi",
    "status": "InTransit",
    "createdAt": "2026-11-16T08:00:00.000Z",
    "updatedAt": "2026-11-16T08:00:00.000Z",
    "customer": { "id": "clx...", "name": "John Smith", "email": "john@acmelogistics.com", "company": "Acme Logistics" }
  }
}
```

**Errors:** `404` `Shipment not found`.

```bash
curl http://localhost:5000/api/v1/shipments/<shipmentId> \
  -H "Authorization: Bearer <accessToken>"
```

### 7.3 `POST /api/v1/shipments`

Create a shipment.

**Request body:**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `trackingNumber` | string | Yes | 3-50 chars, unique |
| `customerId` | string | Yes | Must reference an existing customer id |
| `origin` | string | Yes | 2-100 chars |
| `destination` | string | Yes | 2-100 chars |
| `status` | string | No | Valid `ShipmentStatus` (default `Pending`) |

```json
{
  "trackingNumber": "TRK-2026-005",
  "customerId": "<customerId>",
  "origin": "Chennai",
  "destination": "Kochi",
  "status": "Pending"
}
```

**Success `201`:** `message` `Shipment created`, `data` = the created shipment with the customer
summary.

**Errors:** `404` customer not found (including soft-deleted customer); `409` duplicate tracking
number; `422` validation failure.

```bash
curl -X POST http://localhost:5000/api/v1/shipments \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber":"TRK-2026-005","customerId":"<customerId>","origin":"Chennai","destination":"Kochi","status":"Pending"}'
```

### 7.4 `PATCH /api/v1/shipments/:id/status`

Update a shipment's status. On success the server emits the `shipment_status_changed` Socket.IO
event (see section 11).

**Request body:**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `status` | string | Yes | `Pending` \| `PickedUp` \| `InTransit` \| `Delivered` \| `Cancelled` |

```json
{ "status": "Delivered" }
```

**Success `200`:** `message` `Status updated`, `data` = the updated shipment with a customer
summary (`id`, `name`).

**Errors:** `404` `Shipment not found`; `422` validation failure.

```bash
curl -X PATCH http://localhost:5000/api/v1/shipments/<shipmentId>/status \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"status":"Delivered"}'
```

---

## 8. Dashboard endpoints

### 8.1 `GET /api/v1/dashboard/summary`

Return live operational totals. Values are computed with Prisma `count`/`groupBy` at request time -
never hardcoded. Requires a Bearer token. Total customers excludes soft-deleted customers.

**Success `200`:**

```json
{
  "success": true,
  "message": "Dashboard summary",
  "data": {
    "totalCustomers": 3,
    "totalShipments": 4,
    "shipmentStatusDistribution": {
      "Pending": 1,
      "PickedUp": 1,
      "InTransit": 1,
      "Delivered": 1,
      "Cancelled": 0
    }
  }
}
```

All five status keys are always present, defaulting to `0` when no shipment has that status.

```bash
curl http://localhost:5000/api/v1/dashboard/summary \
  -H "Authorization: Bearer <accessToken>"
```

---

## 9. Chat endpoints

All chat endpoints require a Bearer token. Conversations are scoped to the authenticated user.

### 9.1 `POST /api/v1/chat`

Send a message. If `conversationId` is `null`, a new conversation is created (title = first 50
characters of the message). Otherwise the conversation must belong to the caller.

**Request body:**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `conversationId` | string \| null | No | `null` starts a new conversation; defaults to `null` |
| `message` | string | Yes | 1-2000 chars |

```json
{ "conversationId": null, "message": "How do tracking numbers work?" }
```

**Success `200`:**

```json
{
  "success": true,
  "data": {
    "conversationId": "clx...",
    "message": {
      "id": "clx...",
      "conversationId": "clx...",
      "role": "assistant",
      "content": "Each shipment has a unique tracking number (e.g., TRK-2026-001). ...",
      "createdAt": "2026-11-16T08:05:00.000Z"
    }
  }
}
```

**Errors:** `404` `Conversation not found` (when the id is not owned by the caller); `422`
validation failure; `503` provider unavailable. A failed provider call does not persist a partial
conversation turn.

```bash
curl -X POST http://localhost:5000/api/v1/chat \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":null,"message":"How do tracking numbers work?"}'
```

### 9.2 `GET /api/v1/chat/conversations`

List the caller's conversations, newest first, with a message count.

**Success `200`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "userId": "clx...",
      "title": "How do tracking numbers work?",
      "createdAt": "2026-11-16T08:05:00.000Z",
      "updatedAt": "2026-11-16T08:05:00.000Z",
      "_count": { "messages": 2 }
    }
  ]
}
```

```bash
curl http://localhost:5000/api/v1/chat/conversations \
  -H "Authorization: Bearer <accessToken>"
```

### 9.3 `GET /api/v1/chat/:conversationId/messages`

Return the messages in a conversation (oldest first). The conversation must belong to the caller.

**Success `200`:**

```json
{
  "success": true,
  "data": [
    { "id": "clx...", "conversationId": "clx...", "role": "user", "content": "How do tracking numbers work?", "createdAt": "2026-11-16T08:05:00.000Z" },
    { "id": "clx...", "conversationId": "clx...", "role": "assistant", "content": "Each shipment has a unique tracking number ...", "createdAt": "2026-11-16T08:05:01.000Z" }
  ]
}
```

**Errors:** `404` `Conversation not found`.

```bash
curl http://localhost:5000/api/v1/chat/<conversationId>/messages \
  -H "Authorization: Bearer <accessToken>"
```

---

## 10. Health endpoint

### `GET /health`

Liveness probe for the backend. Public.

**Success `200`:**

```json
{ "success": true, "message": "LogiOps API running", "version": "1.0.0" }
```

```bash
curl http://localhost:5000/health
```

---

## 11. WebSocket event catalogue

The Socket.IO server shares the HTTP server and port with the REST API (default `5000`). The client
connects to `VITE_SOCKET_URL` (default `http://localhost:5000`) and must provide its JWT in
`auth.token` during the connection handshake. Connections for invalid, expired or deleted-user
tokens are rejected.

| Event | Direction | Emitted when | Payload |
| --- | --- | --- | --- |
| `shipment_status_changed` | server -> all clients (broadcast) | After a successful `PATCH /api/v1/shipments/:id/status` | see below |

**Event name:** `shipment_status_changed`

**Payload:**

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

| Field | Type | Notes |
| --- | --- | --- |
| `event` | string | Always `shipment_status_changed` |
| `shipmentId` | string | Shipment id |
| `trackingNumber` | string | Human-readable tracking number |
| `previousStatus` | string | Status before the update |
| `status` | string | New status |
| `updatedAt` | string (ISO 8601) | Persisted update timestamp |

**Guarantees and notes:**

- The event is emitted **only after** the database write succeeds, so clients never observe a
  status that was not persisted.
- The emit is wrapped defensively; if the socket server is not initialized the HTTP request still
  succeeds.
- The server logs `connection` and `disconnect`. Incoming socket messages are not handled (the
  channel is server-to-client broadcast only).
- **Not implemented:** the Socket.IO Redis adapter for multi-instance fan-out.

Minimal client usage (socket.io-client):

```ts
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_SOCKET_URL, {
  auth: { token: localStorage.getItem('logiops_token') },
});
socket.on('shipment_status_changed', (payload) => {
  // invalidate shipment/dashboard queries and show a toast
});
```

---

## 12. Analytics service endpoints

The analytics service is a separate Flask application (default port `5001`). It uses the same
`{ success, message, data }` / `{ success, message, errors }` envelope.

### 12.1 `GET /health`

Public liveness probe.

**Success `200`:**

```json
{
  "success": true,
  "message": "Analytics service healthy",
  "data": { "status": "ok", "service": "analytics-service" }
}
```

```bash
curl http://localhost:5001/health
```

### 12.2 `POST /analyze`

Upload a sales CSV (`multipart/form-data`, field name `file`, `.csv`, maximum 5 MB). Required
columns: `salesperson`, `revenue`, `region`.

**Success `200`:**

```json
{
  "success": true,
  "message": "Sales data analyzed successfully",
  "data": {
    "summary": {
      "totalRevenue": 72000,
      "averageRevenue": 12000,
      "highestSale": 18000,
      "lowestSale": 8000,
      "totalRecords": 6,
      "uniqueSalespeople": 3,
      "uniqueRegions": 3
    },
    "revenueByRegion": [
      { "region": "East", "totalRevenue": 22000 },
      { "region": "North", "totalRevenue": 17000 },
      { "region": "West", "totalRevenue": 33000 }
    ],
    "topSalespeople": [
      { "salesperson": "Jane", "totalRevenue": 33000 },
      { "salesperson": "John", "totalRevenue": 22000 },
      { "salesperson": "David", "totalRevenue": 17000 }
    ],
    "charts": {
      "revenueByRegion": { "data": [ { "type": "bar", "x": [], "y": [] } ], "layout": { "title": "Revenue by Region" } },
      "topSalespeople": { "data": [ { "type": "bar", "x": [], "y": [] } ], "layout": { "title": "Top Salespeople by Revenue" } }
    }
  }
}
```

Rules:

- `revenueByRegion` is sorted by total revenue descending.
- `topSalespeople` is sorted by total revenue descending and limited to the top 5.
- All monetary values are rounded to 2 decimals.
- `charts.*` are Plotly figure JSON objects (bar charts) produced with `fig.to_json()`.
- Server-side PNG export (Kaleido) is **not** implemented; only figure JSON is returned.

**Errors:**

| Case | Status | Body (abridged) |
| --- | --- | --- |
| No file part / empty filename | `400` | `Validation failed` with a `file` field error |
| Extension other than `.csv` | `400` | `Validation failed` with a `file` field error |
| File larger than `MAX_FILE_SIZE_MB` | `400` | `Validation failed` with a `file` field error |
| Missing required columns | `422` | `Validation failed` with one field error per missing column |
| Empty CSV / no data rows | `422` | `Validation failed` with a `file` field error |
| Non-numeric, non-finite or negative revenue | `422` | `Validation failed` with `revenue` field error(s) |
| Blank salesperson or region | `422` | `Validation failed` with the corresponding field error |
| Unexpected server error | `500` | `{ "success": false, "message": "Internal server error" }` |

Example error body:

```json
{
  "success": false,
  "message": "Only .csv files are supported",
  "errors": [ { "field": "file", "message": "Only .csv files are supported" } ]
}
```

```bash
curl -X POST http://localhost:5001/analyze \
  -F "file=@analytics-service/sample_data/sales_sample.csv"
```

Sample CSV (`analytics-service/sample_data/sales_sample.csv`):

```csv
salesperson,revenue,region
John,10000,East
Jane,15000,West
John,12000,East
Jane,18000,West
David,8000,North
David,9000,North
```
