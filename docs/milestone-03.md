# Milestone 03 — Identity, Sessions, Tenancy and RBAC

## Delivered
- Argon2id password hashing and normalized email registration/login.
- First-organization registration creates an OWNER membership in one database transaction.
- HS256 access JWTs with a short configurable lifetime and validated server-side claims.
- Opaque 384-bit refresh tokens; only SHA-256 hashes are stored in PostgreSQL.
- Refresh rotation, token-family revocation on replay/expired-token reuse, and logout revocation.
- HttpOnly, SameSite=Strict refresh cookie with configurable Secure flag and bounded auth rate limits.
- Tenant context is derived from verified membership and active organization records, never from a client-supplied tenant ID.
- Server-side role/permission middleware for OWNER, ADMIN, RESILIENCE_MANAGER, ANALYST and VIEWER.
- Security audit events for organization registration and successful login.
- Token primitive tests and additive Prisma migration.

## API
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout
- GET /api/v1/auth/me (Bearer access token)

Registration requires email, password (12–128 characters), displayName, organizationName and organizationSlug. Login requires email, password and organizationSlug.

## Operational configuration
Set AUTH_TOKEN_SECRET to a randomly generated secret of at least 32 characters. Set COOKIE_SECURE=true behind HTTPS in production. Configure CORS_ORIGIN to the exact trusted frontend origin(s). Access tokens are returned in the response body; refresh tokens are never returned to JavaScript.

## Security boundaries / follow-up
- Tenant role grants are currently centralized in a reviewed server-side permission map; a tenant-managed role editor is not included.
- Refresh selects the first active membership when a user belongs to multiple organizations; explicit tenant switching is a follow-up API capability.
- Cookie refresh is SameSite=Strict and CORS credentialed; deployments must keep frontend/API site topology compatible and enforce HTTPS.
- The audit log is append-oriented at the application layer; database-level immutability and audit export belong to Governance milestone 13.
- Invitation acceptance, MFA, password reset, email verification and platform-admin workflows are intentionally not represented as complete.
