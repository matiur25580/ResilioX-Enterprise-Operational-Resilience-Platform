# Milestone 13 — Governance, Evidence & Audit

## Outcome
Provide tenant-scoped governance records that connect policy/control requirements to reviewed evidence and make critical application actions inspectable through a protected, append-only audit history.

## Delivered
- General evidence register for external document references, with type, description, target context, issue/expiry dates and optional SHA-256 digest.
- Evidence lifecycle: DRAFT → SUBMITTED → VERIFIED or REJECTED.
- Independent reviewer requirement: the evidence creator cannot verify or reject their own submission.
- Policy/control register with framework and control reference, owner, review due date and lifecycle DRAFT → IN_REVIEW → ACTIVE → RETIRED.
- Independent maker-checker approval for policy activation.
- Policy-to-evidence mapping only accepts evidence that is VERIFIED, unexpired and in the same tenant.
- Paginated tenant-scoped audit event query with action, target type and time filters.
- Audit response omits IP addresses and recursively redacts sensitive metadata keys (password, token, secret, cookie, authorization, credential, API key and session).
- Database trigger blocks audit event UPDATE/DELETE except in an explicitly controlled maintenance session using app.audit_maintenance='on'.
- Governance workspace UI for evidence references, policy register, review actions and recent audit history.

## API
All routes are under /api/v1/governance:
- GET /audit/events?limit=50&cursor=<event-id>&action=<text>&targetType=<type>&from=<ISO>&to=<ISO> — requires audit:read; returns stable descending pagination.
- GET /evidence — authenticated tenant members; optional status and targetType filters.
- POST /evidence — requires continuity:write; creates draft evidence metadata/reference (does not upload files).
- POST /evidence/:evidenceId/submit — submits draft evidence.
- POST /evidence/:evidenceId/review — owner/admin/resilience manager; independent reviewer; decision VERIFIED or REJECTED and rationale.
- GET /policies — authenticated tenant members.
- POST /policies — creates draft policy/control record.
- POST /policies/:policyId/submit — submits a draft for review.
- POST /policies/:policyId/approve — owner/admin/resilience manager; independent approver; activates policy.
- POST /policies/:policyId/evidence — links same-tenant, verified, unexpired evidence to an active policy.
- POST /policies/:policyId/retire — owner/admin/resilience manager.

## Authorization
- OWNER: full workspace permissions.
- ADMIN and RESILIENCE_MANAGER: governance writes, independent review/approval and audit reads.
- ANALYST: read evidence/policies and audit history; no governance mutations.
- VIEWER: read evidence/policies; audit history is not granted by the current role matrix.
- Organization ID is always derived from the authenticated membership. Evidence and policy links are checked in tenant scope.

## Data and operational boundaries
- Evidence records store a URI/reference and optional checksum only; binary file upload, malware scanning, immutable object storage and legal-hold retention are not implemented.
- A SHA-256 digest supplied by a user is recorded metadata; the service does not download or independently hash the referenced artifact.
- Audit immutability is enforced by a database trigger. Only FK-driven anonymization of deleted organization/user references is permitted; event content cannot be edited. A separately controlled maintenance connection must explicitly set app.audit_maintenance='on' to perform retention operations. The application API exposes no update/delete operation.
- Audit pagination is bounded to 100 records per page. The current API exposes the latest tenant events; long-term archival and tamper-evident external anchoring remain future controls.
- Framework references are organization-entered mappings, not a compliance attestation or certification.

## Verification and release gates
- API integration tests cover evidence submission, maker-checker review, policy approval, evidence mapping, audit role access and tenant isolation.
- Final CI must validate/generate Prisma, apply migrations, type-check, run tests, build and run the production dependency audit.
- CodeQL must pass on the final PR head.
- Browser workflow, manual assistive-technology review, retention operations testing and independent governance/risk-owner review remain release gates.
- This milestone does not claim regulatory compliance or production readiness.
