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
apply migrations only to the explicitly intended database before deploying
this version. `JWT_SECRET` and `JWT_REFRESH_SECRET` must be configured; the
backend does not issue tokens using built-in fallback secrets.

The Prisma schema uses SQLite. The repository-root `.env` may contain a
different database URL than the backend's local SQLite configuration. Use an
explicit disposable SQLite URL for local schema or API tests, and never point
schema tooling at a shared database for a local smoke test.

The dashboard currently uses the authenticated session profile and the
owner-scoped `GET /api/consultation` endpoint. Risk metrics, appointments, and
agent activity are not exposed by a dashboard API and are intentionally not
presented as available dashboard data.
