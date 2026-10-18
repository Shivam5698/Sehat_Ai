# Backend

This directory contains the Express/TypeScript backend for Sehat AI.

- `npm run dev:backend` starts the backend server.
- `npm run build:backend` compiles the backend.

## Authentication sessions

Access tokens are short-lived JWTs tied to a persisted authentication session.
The browser receives the access and refresh tokens only in `HttpOnly`,
`SameSite=Lax` cookies; the refresh cookie is scoped to `/api/auth/refresh`.
Refresh tokens are stored in the database only as SHA-256 hashes; logout
revokes the session and clears both cookies, and protected requests verify that
the session remains active. `Secure` is enabled for production cookies.

The session table is added by
`prisma/migrations/20261018061000_auth_session_revocation/migration.sql`;
guest consultation ownership is added by
`prisma/migrations/20261018070000_guest_consultation_sessions/migration.sql`.
Apply migrations only to the explicitly intended database before deploying
this version. `JWT_SECRET` and `JWT_REFRESH_SECRET` must be configured; the
backend does not issue tokens using built-in fallback secrets.

The Prisma schema uses SQLite. The repository-root `.env` may contain a
different database URL than the backend's local SQLite configuration. Use an
explicit disposable SQLite URL for local schema or API tests, and never point
schema tooling at a shared database for a local smoke test.

Unauthenticated AI consultations receive a separate random, `HttpOnly`
`sehat_guest` cookie that expires after 24 hours. It grants access only to
consultations created in that guest session; it does not create an account or
attach records to one. Consultation history, report listing, report generation,
and report retrieval remain authenticated and owner-scoped. Generate a saved
report with `POST /api/reports/generate` and `{ "consultationId": "..." }`;
the consultation must belong to the authenticated user.

The dashboard route is public, but personal account and consultation data are
shown only after the session and owner-scoped `GET /api/consultation` endpoint
are confirmed. Risk metrics, appointments, and agent activity are not exposed
by a dashboard API and are intentionally not presented as available data.

## Local development

From the repository root, start the backend and frontend in separate terminals:

```powershell
npm run dev:backend
npm run dev:frontend
```

The backend reads `backend/.env` first. Configure `DATABASE_URL`,
`JWT_SECRET`, and `JWT_REFRESH_SECRET` there; the checked-in Prisma schema
uses SQLite. The backend verifies database connectivity and the authentication
session table before listening on `PORT` (5000 by default). If that port is
already occupied, identify the owning process before stopping it or set an
explicit unused `PORT`.

Redis is used by video-session state and realtime events, not by cookie-backed
signup, login, or session verification. The backend can serve database-backed
authentication while Redis is unavailable, but reports degraded health and
Redis-backed features remain unavailable. To start the configured local Redis
service when Docker Desktop is running:

```powershell
docker compose -f backend/docker-compose.yml up -d redis
```

If Redis is started after the backend, restart the backend to reconnect.
