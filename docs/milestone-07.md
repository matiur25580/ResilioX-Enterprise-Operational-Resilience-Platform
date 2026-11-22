# Milestone 07 — Operational Risk and Controls

## Delivered scope

- Tenant-scoped risk register with accountable owner, category, risk statement and optional link to a business service, process, application, technology asset, supplier or dependency.
- Inherent risk scoring uses likelihood × impact on documented 1–5 scales (score 1–25).
- Residual risk is recalculated from the arithmetic mean of linked control effectiveness values. Only controls with TESTED status may contribute a non-zero effectiveness.
- Risk bands: 1–4 LOW, 5–9 MODERATE, 10–16 HIGH, 17–25 CRITICAL. Residual score zero is permitted when tested control effectiveness is 100%.
- Tenant-scoped control library with type, owner, frequency and lifecycle state.
- Control testing requires a 20-character evidence summary; status, test evidence and timestamp are persisted and audited.
- Risk-control associations, effectiveness assessments and recalculation are performed transactionally.
- Risk treatment actions include owner, due date, status, completion timestamp and audit history.
- Risk lifecycle transitions are validated server-side.
- Responsive workspace with exposure KPIs, ranked risk register, control assurance and treatment tracking.

## API

- `GET /api/v1/risks/summary` — risk and control posture metrics.
- `GET /api/v1/risks` — tenant risk register with control and treatment details.
- `POST /api/v1/risks` — create risk; optional target type and ID must resolve inside the active tenant.
- `GET /api/v1/risks/controls`, `POST /api/v1/risks/controls` — control library.
- `PATCH /api/v1/risks/controls/:controlId/status` — record control state; TESTED requires evidence.
- `POST /api/v1/risks/:riskId/controls` and `PATCH /api/v1/risks/:riskId/controls/:linkId` — link and assess control effectiveness.
- `PATCH /api/v1/risks/:riskId/status` — validated risk lifecycle transition.
- `POST /api/v1/risks/:riskId/treatments`, `PATCH /api/v1/risks/:riskId/treatments/:treatmentId` — create and update treatment actions.

All routes require authentication. Mutations require `continuity:write`. All reads and writes are tenant-scoped; polymorphic target references are checked against the active tenant before creation.

## Scoring model and limitations

Inherent score = likelihood × impact. Residual score = ceiling(inherent score × (1 − average tested-control effectiveness / 100)). The model intentionally uses a transparent average rather than implying statistically calibrated control independence or multiplicative risk reduction. Control effectiveness is a management assessment supported by a recorded test summary, not an automated test execution. No regulatory framework mapping or external GRC integration is claimed.

## Verification

CI must validate the Prisma schema and migration, type-check both workspaces, run tests and build the API and web application before this milestone is considered CI-verified.
