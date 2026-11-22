# Milestone 05 — Business Impact Analysis

## Delivered scope

- Tenant-scoped business impact assessments linked to tenant-owned business processes.
- Versioned assessment records with draft, in-review, approved and retired lifecycle states.
- Five explicit impact horizons: immediate, 4 hours, 24 hours, 72 hours and one week.
- Four impact dimensions per horizon: financial, operational, regulatory and reputational, each rated 1–5.
- MTPD, RTO and RPO stored as integer minutes with validation; RTO must not exceed MTPD and RPO may be zero.
- Explainable criticality calculation: sum the four dimensions at each horizon, select the highest horizon total, then classify 16–20 Critical, 12–15 High, 8–11 Medium and 4–7 Low.
- Draft creation, submission and privileged approval transitions with audit events.
- React assessment register and create/review/approve workflow.

## API

- `GET /api/v1/bia/processes` — tenant-owned process choices.
- `GET /api/v1/bia` and `GET /api/v1/bia/:assessmentId` — tenant-scoped assessments.
- `POST /api/v1/bia` — create a draft assessment and its horizon snapshots.
- `POST /api/v1/bia/:assessmentId/submit` — submit a draft for review.
- `POST /api/v1/bia/:assessmentId/approve` — approve an in-review assessment; OWNER, ADMIN or RESILIENCE_MANAGER only.

All endpoints require an authenticated session. Write operations require `continuity:write`; every query scopes records by the authenticated organization. The process association is verified against that organization before creation.

## Scoring and limitations

The scoring model is a documented fixed baseline, not a configurable enterprise policy. A maximum-over-time-horizons rule is used so an acute severe impact is not averaged away by lower scores at other horizons. Scores are user-entered; the platform does not infer financial loss, regulatory exposure, RTO, RPO or MTPD. Objective units are stored as minutes. Assessment creation preserves version history by creating a new version for a process rather than overwriting an earlier record.

This milestone does not yet include configurable impact scales/weights, editable drafts, assessment retirement controls, evidence attachments, due-date reminders or process-to-service mapping. These remain future scope.

## Verification

CI run [44997564444](https://github.com/matiur25580/ResilioX-Enterprise-Operational-Resilience-Platform/actions/runs/44997564444) passed: Prisma validation and generation, PostgreSQL migration deployment, API/web type checks, tests and builds. Dependency audit findings remain non-blocking and tracked separately; the Prisma 6 toolchain advisories are not remediated by this milestone.
