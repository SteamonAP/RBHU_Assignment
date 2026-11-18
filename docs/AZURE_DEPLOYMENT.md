# LogiOps - Azure Deployment (Proposed Architecture)

> **Status: proposal only.** This document describes a *proposed* Azure target architecture for
> LogiOps. **Actual Azure provisioning is not mandatory for this assessment and has not been
> performed.** No Azure resources exist for this project. Development and demonstration run
> entirely locally (Docker PostgreSQL + the three local services). Nothing here should be read as a
> claim of a live deployment.

---

## Table of contents

- [1. Architecture overview](#1-architecture-overview)
- [2. Application hosting (App Service / Static Web Apps)](#2-application-hosting-app-service--static-web-apps)
- [3. Database hosting (Azure Database for PostgreSQL Flexible Server)](#3-database-hosting-azure-database-for-postgresql-flexible-server)
- [4. Authentication (Entra ID / JWT)](#4-authentication-entra-id--jwt)
- [5. Secret management (Key Vault + managed identity)](#5-secret-management-key-vault--managed-identity)
- [6. Network security (VNet, Private Endpoints, NSGs)](#6-network-security-vnet-private-endpoints-nsgs)
- [7. Deployment steps](#7-deployment-steps)
- [8. Security considerations](#8-security-considerations)
- [9. Future CI/CD approach (GitHub Actions)](#9-future-cicd-approach-github-actions)

---

## 1. Architecture overview

The proposed topology maps the three LogiOps services onto managed Azure PaaS offerings, with the
database isolated behind a private endpoint and all secrets sourced from Key Vault.

```text
                          +-------------------------------+
                          |            Internet           |
                          +---------------+---------------+
                                          |
                                          v
                     +-----------------------------------------+
                     |   Azure Static Web Apps (frontend)      |
                     |   React 19 SPA (built with Vite)        |
                     |   global CDN + TLS                      |
                     +------------------+----------------------+
                                        |  HTTPS (REST + WebSocket)
                                        v
        +---------------------------------------------------------------+
        |  Azure App Service (Linux) - Backend API                      |
        |  Node.js + Express + TypeScript (dist/)                       |
        |  REST /api/v1  +  Socket.IO (same origin/port)                |
        |  Managed Identity -> Key Vault (secrets)                      |
        +---------------+-----------------------------------------------+
                        |  Private Endpoint (VNet integration)
                        |                          \
                        |                           \  outbound HTTPS
                        v                            v
        +-----------------------------+   +-----------------------------------+
        | Azure Database for          |   | Azure App Service (Linux)         |
        | PostgreSQL Flexible Server  |   | Analytics service (Flask/Gunicorn)|
        | private access only         |   | POST /analyze, GET /health        |
        +-----------------------------+   +-----------------------------------+
                        ^
                        |
        +-----------------------------+   +-------------------------------+
        | Azure Key Vault             |   | Microsoft Entra ID            |
        | secrets via managed identity|   | optional identity provider    |
        +-----------------------------+   +-------------------------------+
                        |
        +-----------------------------+
        | Application Insights +      |
        | Log Analytics workspace     |
        +-----------------------------+
```

Requests from the SPA go to the backend App Service over HTTPS (REST) and WSS (Socket.IO). The
backend is the only service that talks to PostgreSQL, over a private endpoint. The analytics
service is stateless and receives CSV uploads from the SPA directly. Telemetry from all services
flows to Application Insights / Log Analytics.

---

## 2. Application hosting (App Service / Static Web Apps)

### Frontend - Azure Static Web Apps

- The Vite SPA builds to static assets (`npm run build` -> `dist/`).
- Deploy to **Azure Static Web Apps** (recommended) for global CDN, free TLS certificates, custom
  domains, and built-in GitHub integration.
- Configure the API base URL at build time via environment variables:
  - `VITE_API_URL` -> the backend App Service URL + `/api/v1`
  - `VITE_SOCKET_URL` -> the backend App Service URL
  - `VITE_ANALYTICS_API_URL` -> the analytics App Service URL
- If a single origin is required, the SPA can alternatively be served from the backend App Service
  as static files, but Static Web Apps is preferred for separation of concerns and CDN caching.

### Backend API - Azure App Service (Linux)

- Runtime: Node.js 20 LTS. Build with `npm ci && npm run build`; start with `npm start`
  (`node dist/server.js`).
- App settings (non-secret): `NODE_ENV=production`, `PORT` (App Service sets this),
  `CORS_ORIGIN=<Static Web Apps host>`, `JWT_EXPIRE`, `RATE_LIMIT_*`, `AI_PROVIDER`,
  `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OPENAI_BASE_URL`, `OPENAI_MODEL`.
- Secret settings (`DATABASE_URL`, `JWT_SECRET`, and `OPENAI_API_KEY` when using the hosted
  provider) are **Key Vault references** resolved via managed identity (section 5), not plaintext
  app settings.
- **Important - Socket.IO and scale:** the backend keeps in-memory Socket.IO connections. With
  **more than one instance**, events do not fan out across instances unless the Socket.IO Redis
  adapter is added. Until then, either run a **single instance** or accept instance-local realtime.
  The Redis adapter is not implemented in this codebase.
- Configure **health check path** `/health` so App Service can probe liveness.
- Consider **deployment slots** (for example `staging`) with slot swap for zero-downtime releases.

### Analytics service - Azure App Service (Linux)

- Runtime: Python 3.12. Install with `pip install -r requirements.txt`; run with
  `gunicorn "app:create_app()" --bind 0.0.0.0:8000`.
- App settings: `PORT`, `MAX_FILE_SIZE_MB`, `CORS_ORIGIN` (set to the SPA origin rather than `*`).
- A separate App Service (or Azure Container Apps) keeps the analytics workload independent so it
  can scale on CPU without affecting the API.
- The service is stateless, so it scales horizontally without coordination.

---

## 3. Database hosting (Azure Database for PostgreSQL Flexible Server)

- Use **Azure Database for PostgreSQL - Flexible Server** (PostgreSQL 18-compatible major version).
- Create the `assessment_db` database and a dedicated application user (not the admin user).
- Apply the schema with Prisma migrations during deployment (`npx prisma migrate deploy` /
  `npm run db:migrate`) against the flexible server.
- **Private access only:** deploy the server with VNet integration and a **private DNS zone** so it
  has no public endpoint; the backend reaches it over a private endpoint inside the VNet
  (section 6).
- Configure automated backups with a retention window appropriate to the environment, enable
  high availability if required, and set a maintenance window.
- Connection string form (secret, stored in Key Vault):

```text
postgresql://logiops_app:<password>@<server>.postgres.database.azure.com:5432/assessment_db?schema=public&sslmode=require
```

- Enforce `sslmode=require` (TLS to the database).

---

## 4. Authentication (Entra ID / JWT)

Two options are available. The **implemented** mechanism is JWT; Entra ID is the proposed
production-grade alternative.

### 4.1 Implemented: application JWT (default)

- The backend issues its own HS256 JWTs on `POST /api/v1/auth/login` (bcrypt-verified credentials),
  signed with `JWT_SECRET` (Key Vault) and expiring after `JWT_EXPIRE`.
- The SPA stores the token and sends it as `Authorization: Bearer <token>`.
- Pros: simple, self-contained, no external identity dependency. Cons: the app owns credential
  handling, password policy, token revocation and refresh.

### 4.2 Proposed: Microsoft Entra ID

- Register two Entra ID applications: one for the SPA (public client) and one for the backend API
  (expose a scope such as `api://<backend-app-id>/access_as_user`).
- The SPA authenticates users against Entra ID (MSAL) and acquires an access token for the API
  scope; the backend validates the token (issuer, audience, signature against Entra ID's OpenID
  metadata) instead of validating its own JWT.
- Benefits: SSO, conditional access, MFA, centralised user lifecycle, group-based authorisation to
  back the existing `authorize(...roles)` middleware.
- Migration path: add a token-validation strategy that accepts Entra ID tokens while `authenticate`
  resolves the local `User` record by the token's object id / email, preserving the existing
  `req.user` contract and RBAC.

In both cases, transport is HTTPS/TLS and tokens are sent only over TLS.

---

## 5. Secret management (Key Vault + managed identity)

- Create an **Azure Key Vault** per environment and store:
  `DATABASE_URL`, `JWT_SECRET`, and any AI provider credentials. The analytics service has no
  secrets beyond configuration.
- Grant each App Service a **system-assigned managed identity** and give that identity
  `get`/`list` secret permissions on the Key Vault (via RBAC role `Key Vault Secrets User`).
- Reference secrets from App Service **application settings** using Key Vault references:

```text
@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/DATABASE-URL/)
@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/JWT-SECRET/)
```

- Rules:
  - Never commit secrets to the repository. `.env` files stay local and are git-ignored.
  - Rotate `JWT_SECRET` and the database credential on a schedule; rotate on any suspected exposure
    (rotating `JWT_SECRET` invalidates all outstanding tokens, which is acceptable given the short
    `15m` expiry).
  - Restrict Key Vault networking to the platform (private endpoint or trusted services) as
    described in section 6.

---

## 6. Network security (VNet, Private Endpoints, NSGs)

Proposed network isolation:

- Create a **Virtual Network** with dedicated subnets:
  - an **App Service integration subnet** (delegated to `Microsoft.Web/serverFarms`) used for
    outbound VNet integration of the backend and analytics App Services;
  - a **private endpoint subnet** for the PostgreSQL flexible server (and Key Vault).
- **VNet integration** on the backend App Service lets it reach the database and Key Vault over
  private addresses without traversing the public internet.
- **Private Endpoint** for Azure Database for PostgreSQL: the database has no public network
  access; it is reachable only from inside the VNet.
- **Private DNS zone** linked to the VNet so the database hostname resolves to the private IP.
- **Network Security Groups (NSGs)** on the subnets restrict:
  - inbound database traffic to the private endpoint subnet only;
  - outbound from the integration subnet to required Azure services (database, Key Vault, telemetry)
    and deny unnecessary egress.
- Optionally place the SPA behind **Azure Front Door** / the Static Web Apps CDN and add a **WAF**
  policy for the public entry point.
- **Access restrictions** on the App Services can limit inbound traffic to the Static Web Apps
  origin and the analytics service as needed.

---

## 7. Deployment steps

High-level, human-driven steps for provisioning the proposed environment (not performed):

1. **Resource group** - create `rg-logiops-<env>` in the target region.
2. **Networking** - create the VNet, subnets, NSGs, private DNS zone.
3. **Database** - create the PostgreSQL Flexible Server in the delegated subnet with private access
   only; create `assessment_db` and the application user.
4. **Key Vault** - create the vault; add secrets `DATABASE-URL` and `JWT-SECRET`; note the vault URI.
5. **Backend App Service** - create a Linux App Service (Node 20); enable system-assigned managed
   identity; grant it `Key Vault Secrets User`; set non-secret app settings; set Key Vault reference
   settings for `DATABASE_URL` and `JWT_SECRET`; add VNet integration; set health check `/health`.
6. **Analytics App Service** - create a Linux App Service (Python 3.12); deploy with Gunicorn; set
   `PORT`, `MAX_FILE_SIZE_MB`, `CORS_ORIGIN`.
7. **Frontend Static Web App** - create it, link the repository, set build output and the
   `VITE_API_URL` / `VITE_SOCKET_URL` / `VITE_ANALYTICS_API_URL` build variables.
8. **Database migration** - run `npx prisma migrate deploy` against the flexible server from CI or a
   one-off job; optionally seed.
9. **Observability** - create Application Insights + a Log Analytics workspace; connect all
   services; add alert rules (5xx rate, response time, health probe failures).
10. **Verify** - hit `GET /health` on both App Services; log in through the SPA; confirm REST and
    Socket.IO work end to end.

---

## 8. Security considerations

- **Transport** - HTTPS/TLS everywhere; `sslmode=require` to PostgreSQL; WSS for Socket.IO.
- **Secrets** - Key Vault + managed identity only; no secrets in code, CI logs or app settings
  plaintext.
- **Identity** - prefer Entra ID in production; if using app JWT, keep `JWT_SECRET` strong and
  rotate; keep token lifetime short (`15m`).
- **Network** - private endpoint for the database, NSG-restricted subnets, optional WAF at the
  edge.
- **CORS** - restrict `CORS_ORIGIN` to the Static Web Apps host (do not leave permissive origins).
- **Rate limiting** - `express-rate-limit` on `/api/*`; tune window/max per environment.
- **Headers** - helmet remains enabled for security headers.
- **Least privilege** - the application database user has only the privileges it needs; the managed
  identity has only `Key Vault Secrets User`.
- **Uploads** - the analytics service bounds file size and validates content; keep `MAX_FILE_SIZE_MB`
  conservative.
- **Logging/PII** - logs are structured (Winston); avoid logging secrets or full request bodies;
  Application Insights sampling and retention should respect data-handling policy.
- **Backups/DR** - automated database backups with a tested restore path.

---

## 9. Future CI/CD approach (GitHub Actions)

No CI workflow is currently included in the repository. The proposed production pipeline (GitHub
Actions) has three stages: build & test, deploy to a staging slot, then swap / release.

```text
   GitHub push / PR
        |
        v
  +---------------------------------------------------------------+
  | Stage 1: build & test (matrix: backend, frontend, analytics)  |
  |  backend:   npm ci -> npm run build (tsc)                     |
  |             (lint / tests when added)                         |
  |  frontend:  npm ci -> npm run lint -> npm run build           |
  |  analytics: pip install -r requirements.txt -> pytest         |
  +-----------------------------------+---------------------------+
                                      |  on success (main / release)
                                      v
  +---------------------------------------------------------------+
  | Stage 2: deploy to staging                                    |
  |  backend   -> App Service staging slot (zip deploy)          |
  |  analytics -> App Service staging slot (Gunicorn)            |
  |  frontend  -> Static Web Apps preview environment            |
  |  run: npx prisma migrate deploy (against DB)                  |
  +-----------------------------------+---------------------------+
                                      |  smoke tests pass
                                      v
  +---------------------------------------------------------------+
  | Stage 3: release                                             |
  |  swap App Service staging -> production slot                 |
  |  promote Static Web Apps preview -> production               |
  |  tag release + notify                                        |
  +---------------------------------------------------------------+
```

Pipeline characteristics:

- **Triggers:** pull requests run Stage 1 only; pushes to `main` (or a release tag) run all stages.
- **Authentication to Azure:** GitHub Actions authenticates via **OIDC federated credentials**
  (workload identity federation) to a service principal - no long-lived publish profiles or
  secrets stored in GitHub.
- **Secrets:** the pipeline never needs application secrets; the App Services resolve them from Key
  Vault at runtime. Only deployment credentials (via OIDC) and the database migration connection
  (Key Vault reference / short-lived token) are needed.
- **Rollback:** slot swap back, or redeploy the previous artifact; migrations should be written to
  be backward compatible.
- **Quality gates:** lint, type-check (`tsc`), and tests (frontend and analytics) must pass before
  any deploy stage runs.

> Reminder: this is a *proposed* CI/CD approach. The repository currently contains no project
> GitHub Actions workflow, Dockerfiles for the application services, or Azure environment.

### 9.1 Container-based alternative: GitHub Actions + ACR + Azure Container Apps

The App Service deployment above can deploy application packages directly. A container-based
alternative is to package the backend and analytics service as separate images and deploy them to
Azure Container Apps. This improves build/runtime consistency and gives each service an independently
versioned revision, but adds Dockerfiles, image scanning, registry configuration and container
operations.

Recommended component split:

| Component | Proposed deployment | Why |
| --- | --- | --- |
| React frontend | Azure Static Web Apps | The Vite output is static content; a CDN/static host is simpler than running a web-server container. |
| Backend API | Azure Container Apps container | Independently deployable Node.js service; supports HTTP and Socket.IO ingress. |
| Analytics API | Azure Container Apps container | Independently deployable Python service that can scale separately for CSV work. |
| PostgreSQL | Azure Database for PostgreSQL Flexible Server | Keep durable production data in a managed database, not in an ephemeral application container. |
| Images | Azure Container Registry (ACR) | Private registry integrated with Azure identity and deployment. Docker Hub is a possible alternative registry. |

Pipeline outline:

1. On pull requests, GitHub Actions installs locked dependencies and runs frontend lint/build,
   backend TypeScript build and analytics tests. Add backend integration tests against a temporary
   PostgreSQL service before treating them as a deployment gate.
2. After merge to the protected `main` branch, build the backend and analytics images. Tag each
   image with the commit SHA (not only a mutable `latest` tag), scan it, and push it to ACR.
3. Authenticate GitHub Actions to Azure using OIDC federation; avoid long-lived Azure credentials
   in repository secrets. Deploy the new images to staging revisions in Azure Container Apps.
4. Run health checks and smoke tests. Apply Prisma migrations as a controlled deployment step using
   a least-privilege database identity. Require approval before promoting the tested revisions to
   production.
5. Keep the prior healthy image/revision available for application rollback. Make database
   migrations backward-compatible because reverting an application image does not automatically
   revert a schema migration.

Application secrets such as the database URL, JWT signing key and any AI provider key should be
retrieved at runtime from Key Vault using managed identity. Do not copy secrets into container
images, Docker build arguments, source code or CI logs.

If a requirement specifically calls for every *application* component to run in a container, the
frontend can also be packaged as a small Nginx image. For this SPA, Static Web Apps is the simpler
default; PostgreSQL should still remain a managed database service. Neither this option nor the
App Service pipeline above is implemented in the current repository.
