# LogiOps Frontend

React + TypeScript operations platform for the LogiOps logistics backend. Built with
Vite, Tailwind CSS v4 and TanStack Query, consuming the REST + Socket.IO API and the
Python analytics service.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build
npm run lint     # eslint
```

## Environment variables

Copy `.env.example` to `.env` and adjust if your services run elsewhere:

| Variable                 | Default                        | Description                |
| ------------------------ | ------------------------------ | -------------------------- |
| `VITE_API_URL`           | `http://localhost:5000/api/v1` | Backend REST API base URL  |
| `VITE_SOCKET_URL`        | `http://localhost:5000`        | Socket.IO server URL       |
| `VITE_ANALYTICS_API_URL` | `http://localhost:5001`        | Python analytics service   |

## Screens

- **Login** – email + password, stores the JWT and restores the session via `/auth/me`.
- **Dashboard** – total customers / shipments, shipment status distribution chart,
  live refresh on `shipment_status_changed` socket events.
- **Customers** – paginated + searchable list, create, edit and soft-delete.
- **Shipments** – paginated list (tracking number, customer, route, status), create
  shipment and update status.
- **Analytics** – upload a sales CSV, view summary cards, revenue-by-region and
  top-salespeople charts plus a summary statistics table.
- **AI Assistant** – chat with conversation history and conversation continuity.
- **404** – fallback page for unknown routes.

## Demo credentials

```
admin@logiops.com / Admin@123
```
