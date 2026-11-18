# LogiOps - Database Schema

LogiOps uses **PostgreSQL** accessed through the **Prisma ORM**. This document lists the full
Prisma schema, the ER diagram, every model and field (type / nullability / notes), the enums, the
relationships and their cardinality, the indexing and uniqueness decisions, the soft-delete
strategy, and the migration and seeding workflow.

- Provider: `postgresql`
- Prisma schema: `backend/prisma/schema.prisma`
- Generated client output: `backend/generated/prisma`
- Development database: PostgreSQL 18 in Docker, database `assessment_db`, host port `5433`

---

## Table of contents

- [1. Full Prisma schema listing](#1-full-prisma-schema-listing)
- [2. Entity-relationship diagram](#2-entity-relationship-diagram)
- [3. Enums](#3-enums)
- [4. Models and fields](#4-models-and-fields)
- [5. Relationships and cardinality](#5-relationships-and-cardinality)
- [6. Indexing and uniqueness](#6-indexing-and-uniqueness)
- [7. Soft-delete strategy](#7-soft-delete-strategy)
- [8. Migration and seeding workflow](#8-migration-and-seeding-workflow)

---

## 1. Full Prisma schema listing

The complete contents of `backend/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma"
}

enum UserRole {
  ADMIN
  USER
}

enum CustomerStatus {
  Active
  Inactive
}

enum ShipmentStatus {
  Pending
  PickedUp
  InTransit
  Delivered
  Cancelled
}

enum MessageRole {
  user
  assistant
  system
}

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  role         UserRole @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  conversations ChatConversation[]
}

model Customer {
  id        String         @id @default(cuid())
  name      String
  email     String         @unique
  company   String
  status    CustomerStatus @default(Active)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  deletedAt DateTime?
  shipments Shipment[]
}

model Shipment {
  id             String         @id @default(cuid())
  trackingNumber String         @unique
  customerId     String
  origin         String
  destination    String
  status         ShipmentStatus @default(Pending)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  customer       Customer       @relation(fields: [customerId], references: [id])
}

model ChatConversation {
  id        String        @id @default(cuid())
  userId    String
  title     String        @default("New Conversation")
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  user      User          @relation(fields: [userId], references: [id])
  messages  ChatMessage[]
}

model ChatMessage {
  id             String           @id @default(cuid())
  conversationId String
  role           MessageRole
  content        String
  createdAt      DateTime         @default(now())
  conversation   ChatConversation @relation(fields: [conversationId], references: [id])
}
```

---

## 2. Entity-relationship diagram

```mermaid
erDiagram
    USER ||--o{ CHAT_CONVERSATION : owns
    CHAT_CONVERSATION ||--o{ CHAT_MESSAGE : contains
    CUSTOMER ||--o{ SHIPMENT : ships

    USER {
        string id PK
        string name
        string email UK
        string passwordHash
        UserRole role
        datetime createdAt
        datetime updatedAt
    }

    CUSTOMER {
        string id PK
        string name
        string email UK
        string company
        CustomerStatus status
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }

    SHIPMENT {
        string id PK
        string trackingNumber UK
        string customerId FK
        string origin
        string destination
        ShipmentStatus status
        datetime createdAt
        datetime updatedAt
    }

    CHAT_CONVERSATION {
        string id PK
        string userId FK
        string title
        datetime createdAt
        datetime updatedAt
    }

    CHAT_MESSAGE {
        string id PK
        string conversationId FK
        MessageRole role
        string content
        datetime createdAt
    }
```

---

## 3. Enums

| Enum | Values | Used by |
| --- | --- | --- |
| `UserRole` | `ADMIN`, `USER` | `User.role` |
| `CustomerStatus` | `Active`, `Inactive` | `Customer.status` |
| `ShipmentStatus` | `Pending`, `PickedUp`, `InTransit`, `Delivered`, `Cancelled` | `Shipment.status` |
| `MessageRole` | `user`, `assistant`, `system` | `ChatMessage.role` |

Notes:

- `ShipmentStatus` and `CustomerStatus` values are case-sensitive and must be sent exactly as
  shown in requests (Zod enums mirror these values).
- `MessageRole` is lowercase by convention because it mirrors chat-completion message roles.

---

## 4. Models and fields

Column types below are the logical Prisma types (mapped by Prisma to PostgreSQL types on
migration). "Nullability" reflects whether the field is optional (`?`).

### 4.1 `User`

Represents an authenticated platform user (employee).

| Column | Type | Nullable | Constraints | Notes |
| --- | --- | --- | --- | --- |
| `id` | `String` | No | PK, default `cuid()` | Primary key; used as JWT `userId` |
| `name` | `String` | No | - | Display name |
| `email` | `String` | No | **unique** | Login identifier |
| `passwordHash` | `String` | No | - | bcrypt hash of the password (never plaintext) |
| `role` | `UserRole` | No | default `USER` | `ADMIN` or `USER` |
| `createdAt` | `DateTime` | No | default `now()` | Creation timestamp |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Last update timestamp |

### 4.2 `Customer`

Represents a company/contact the logistics company ships for. Soft-deletable.

| Column | Type | Nullable | Constraints | Notes |
| --- | --- | --- | --- | --- |
| `id` | `String` | No | PK, default `cuid()` | Primary key |
| `name` | `String` | No | - | Contact name |
| `email` | `String` | No | **unique** | Contact email |
| `company` | `String` | No | - | Company name |
| `status` | `CustomerStatus` | No | default `Active` | `Active` or `Inactive` |
| `createdAt` | `DateTime` | No | default `now()` | Creation timestamp |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Last update timestamp |
| `deletedAt` | `DateTime` | **Yes** | - | Set on soft delete; `null` means active |

### 4.3 `Shipment`

Represents a consignment belonging to a customer.

| Column | Type | Nullable | Constraints | Notes |
| --- | --- | --- | --- | --- |
| `id` | `String` | No | PK, default `cuid()` | Primary key |
| `trackingNumber` | `String` | No | **unique** | Human-readable tracking reference |
| `customerId` | `String` | No | FK -> `Customer.id` | Owning customer |
| `origin` | `String` | No | - | Origin location |
| `destination` | `String` | No | - | Destination location |
| `status` | `ShipmentStatus` | No | default `Pending` | Lifecycle status |
| `createdAt` | `DateTime` | No | default `now()` | Creation timestamp |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Last update timestamp |

### 4.4 `ChatConversation`

Represents a single AI-assistant conversation owned by a user.

| Column | Type | Nullable | Constraints | Notes |
| --- | --- | --- | --- | --- |
| `id` | `String` | No | PK, default `cuid()` | Primary key |
| `userId` | `String` | No | FK -> `User.id` | Owner |
| `title` | `String` | No | default `"New Conversation"` | Derived from the first message |
| `createdAt` | `DateTime` | No | default `now()` | Creation timestamp |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Last update timestamp |

### 4.5 `ChatMessage`

Represents one turn (message) inside a conversation.

| Column | Type | Nullable | Constraints | Notes |
| --- | --- | --- | --- | --- |
| `id` | `String` | No | PK, default `cuid()` | Primary key |
| `conversationId` | `String` | No | FK -> `ChatConversation.id` | Parent conversation |
| `role` | `MessageRole` | No | - | `user`, `assistant` or `system` |
| `content` | `String` | No | - | Message text |
| `createdAt` | `DateTime` | No | default `now()` | Creation timestamp |

---

## 5. Relationships and cardinality

| Relationship | Cardinality | Foreign key | Meaning |
| --- | --- | --- | --- |
| `User` -> `ChatConversation` | 1 : N | `ChatConversation.userId` | A user owns many conversations; a conversation belongs to one user |
| `ChatConversation` -> `ChatMessage` | 1 : N | `ChatMessage.conversationId` | A conversation contains many messages; a message belongs to one conversation |
| `Customer` -> `Shipment` | 1 : N | `Shipment.customerId` | A customer has many shipments; a shipment belongs to one customer |

In Prisma terms:

```prisma
model User {
  // ...
  conversations ChatConversation[]
}

model Customer {
  // ...
  shipments Shipment[]
}

model Shipment {
  // ...
  customer   Customer @relation(fields: [customerId], references: [id])
}

model ChatConversation {
  // ...
  user     User          @relation(fields: [userId], references: [id])
  messages ChatMessage[]
}

model ChatMessage {
  // ...
  conversation ChatConversation @relation(fields: [conversationId], references: [id])
}
```

**Cascade behaviour:** no `onDelete` strategy is declared, so Prisma/PostgreSQL default to
`RESTRICT` on the referencing rows. Deletes are avoided entirely through soft delete for
customers, so a customer's shipment history is never orphaned or cascaded away.

---

## 6. Indexing and uniqueness

| Field | Constraint | Rationale |
| --- | --- | --- |
| `User.id` | Primary key | Unique identity used for JWT `userId` and relations |
| `User.email` | Unique | Prevents duplicate accounts; used as the login lookup |
| `Customer.id` | Primary key | Identity for shipment relations |
| `Customer.email` | Unique | Prevents duplicate customer contacts; duplicates surface as HTTP 409 (`P2002`) |
| `Shipment.id` | Primary key | Identity |
| `Shipment.trackingNumber` | Unique | A tracking number must be globally unique; duplicates surface as HTTP 409 (`P2002`) |
| `ChatConversation.id` | Primary key | Identity |
| `ChatMessage.id` | Primary key | Identity |

Why these and not more:

- The unique constraints correspond directly to real business keys (email addresses and tracking
  numbers). They are enforced in the database, so the API maps Prisma error `P2002` to HTTP `409`
  with a clear `Duplicate {field} value.` message.
- List endpoints filter on `Customer` (`deletedAt`, `status`, and search over
  `name`/`email`/`company`) and `Shipment` (`status`, `customerId`). The schema deliberately keeps
  explicit composite indexes out of scope because the dataset is small at this stage. If traffic
  grows, add indexes on `Customer.deletedAt`, `Shipment.status`, `Shipment.customerId` and the
  searched columns.

---

## 7. Soft-delete strategy

Customers are **soft deleted**, never hard deleted.

- `Customer.deletedAt` is a nullable timestamp.
- `DELETE /api/v1/customers/:id` sets `deletedAt = new Date()` instead of removing the row.
- Every normal customer query filters on `deletedAt: null`:
  - list: `where: { deletedAt: null, ... }` (see `customerRepository.findAll`)
  - detail: `findFirst({ where: { id, deletedAt: null } })` (see `customerRepository.findById`)
  - dashboard total customers: `count({ where: { deletedAt: null } })` (see `dashboardService.getSummary`)
- The 404 path is unchanged: a soft-deleted customer behaves as "not found" for detail/update/delete.

Why:

- **History preservation** - a customer's shipments remain queryable and correctly attributed after
  the customer is removed from the active directory (`Shipment.customerId` never dangles).
- **Reversibility** - the record can be restored by clearing `deletedAt`.
- **Reporting integrity** - historical aggregates remain consistent.

Consequences:

- A soft-deleted customer disappears from list/detail/search responses and from the dashboard
  "total customers" count.
- Its unique email remains reserved in the table (the row still exists).
- Shipments themselves are not soft deleted; they are shared operational records.

---

## 8. Migration and seeding workflow

### Prerequisites

PostgreSQL must be running (Docker) and `DATABASE_URL` must point at it:

```powershell
docker compose up -d postgres
```

```text
DATABASE_URL="postgresql://postgres:postgres123@127.0.0.1:5433/assessment_db?schema=public"
```

### Generate the Prisma client

```powershell
cd backend
npx prisma generate     # or: npm run db:generate
```

The client is generated into `backend/generated/prisma` (per the `output` in `schema.prisma`), not
the default `node_modules/.prisma`.

### Apply the schema

Two equivalent approaches:

```powershell
# Option A - create and apply a migration (tracked, recommended)
npx prisma migrate dev  # or: npm run db:migrate

# Option B - push the schema without creating a migration file
npx prisma db push
```

`prisma migrate dev` creates a migration under `backend/prisma/migrations/` and applies it.
`prisma db push` syncs the database to the schema without migration history - convenient for quick
local iteration.

### Seed the database

```powershell
npm run db:seed         # ts-node prisma/seed.ts
```

The seed script (`backend/prisma/seed.ts`) is idempotent (it uses `upsert`) and creates:

- **Admin user** - `admin@logiops.com` / `Admin@123` (password hashed with bcrypt, cost 12), role
  `ADMIN`.
- **Customers** - Acme Logistics (Active), Global Shipping Co (Active), Fast Freight Ltd
  (Inactive).
- **Shipments** - `TRK-2026-001` (InTransit), `TRK-2026-002` (Delivered), `TRK-2026-003` (Pending),
  `TRK-2026-004` (PickedUp).

### Reset and re-seed

To start from a clean database:

```powershell
# Drop and recreate the schema, then re-run migrations (and seed if configured)
npx prisma migrate reset

# Or, to reload only the seed data on an existing schema
npm run db:seed
```

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for the full reset procedure, including recreating the Docker
volume.
