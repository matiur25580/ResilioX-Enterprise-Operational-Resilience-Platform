# Security and Privacy Baseline

This document defines the minimum security posture for implementation. It is a design baseline, not a certification or claim that controls are already implemented.

## Identity and sessions
- Hash passwords with a modern adaptive password hashing algorithm (Argon2id preferred).
- Never store plaintext passwords or raw refresh tokens.
- Use short-lived access tokens and refresh-token rotation with reuse detection.
- Revoke sessions on logout, credential reset and administrative suspension.
- Apply login throttling and generic authentication failure responses.
- Require secure, HttpOnly, appropriately SameSite cookies if refresh tokens are cookie-based.

## Tenant isolation
- Resolve tenant membership from authenticated server-side identity.
- Require tenant scope in every tenant-owned repository operation.
- Avoid trusting tenant IDs supplied only by request bodies or query strings.
- Test cross-tenant read, update, delete, export and realtime subscription attempts.
- Ensure background jobs carry explicit tenant context.

## Authorization
- Use least-privilege role and permission assignments.
- Enforce authorization in backend application services.
- Check both action permission and resource tenant/ownership scope.
- Audit privileged operations and permission changes.
- Do not rely on hidden UI controls as an authorization mechanism.

## Data protection
- Validate and normalize input at trust boundaries.
- Avoid collecting sensitive personal data unless required by a defined workflow.
- Never log passwords, tokens, secrets or unnecessary personal data.
- Use TLS in deployed environments and secure secret management.
- Define retention and deletion policies before introducing production personal data.
- Keep uploaded evidence access-controlled and validate file type, size and storage location.

## Application security
- Apply secure HTTP headers and a restrictive CORS policy.
- Use rate limits for authentication and expensive operations.
- Protect against SQL injection through parameterized ORM queries.
- Prevent mass assignment by using explicit input schemas.
- Validate external callback/webhook signatures before processing.
- Use CSRF protections where cookie authentication requires them.
- Keep dependencies patched and scan them in CI.

## Auditability
Critical actions should record actor, tenant, action, target, timestamp, request/correlation ID and a minimal change summary. Audit events must not include secrets. Application roles should not be able to silently rewrite historical audit records.

## Operational safeguards
- Backups must be encrypted and restore-tested.
- Recovery actions with production impact require explicit authorization and confirmation.
- Simulated actions must be visibly labelled.
- External integrations must use scoped credentials and revocation procedures.
- Fail closed when tenant identity or authorization cannot be established.

## Release gate
Before a production release, review authentication, tenant isolation, authorization, file handling, secrets, logging, dependency vulnerabilities, backup restoration and incident response procedures.
