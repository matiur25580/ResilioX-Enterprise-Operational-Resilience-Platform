# Milestone 08 — Business Continuity Management

## Delivered

- Tenant-scoped, service-linked continuity plans with immutable version sequence per business service.
- Structured plan content: scope, activation criteria, recovery strategy, recovery procedures, communications plan, owner, RTO, RPO and review due date.
- Governed lifecycle: DRAFT → IN_REVIEW → APPROVED → RETIRED.
- Maker-checker approval: the user who submits a plan cannot approve that same version; a different OWNER, ADMIN or RESILIENCE_MANAGER must approve.
- Authorized retirement of approved plans.
- Exercises against approved plans: tabletop, walkthrough, simulation and full-scale.
- Exercise lifecycle: PLANNED → IN_PROGRESS → COMPLETED, with cancellation supported.
- Completion requires a recorded result and findings summary.
- Exercise remediation actions include title, accountable owner, severity, due date, status and completion timestamp.
- Tenant-scoped summary metrics for approved plans, overdue reviews, upcoming exercises, failed exercises, open actions and overdue actions.
- Responsive UI for plan authoring, submission, approval, exercise scheduling, outcomes and remediation.

## API

- `GET /api/v1/continuity/summary`
- `GET /api/v1/continuity/services`
- `GET /api/v1/continuity`
- `POST /api/v1/continuity`
- `POST /api/v1/continuity/:planId/submit`
- `POST /api/v1/continuity/:planId/approve`
- `POST /api/v1/continuity/:planId/retire`
- `POST /api/v1/continuity/:planId/exercises`
- `PATCH /api/v1/continuity/exercises/:exerciseId/status`
- `POST /api/v1/continuity/exercises/:exerciseId/actions`
- `PATCH /api/v1/continuity/actions/:actionId`

All routes require authentication. Mutations require `continuity:write`. Resource ownership is checked through the active organization context. Approval and retirement require elevated workspace roles. Plan submission and approval are recorded in audit events.

## Data model

- `ContinuityPlan`: service-linked, versioned plan and recovery content.
- `ContinuityExercise`: scheduled exercise, scenario, objectives, lifecycle and outcome.
- `ContinuityAction`: post-exercise remediation with accountable owner, severity and due date.

The migration adds enum types, tenant-scoped plan indexes and foreign-key relationships. Plans are linked to existing tenant-owned business services; exercises and actions inherit scope through their parent plan.

## Business rules

- A plan is created as DRAFT and gets the next version for its tenant/service pair.
- Only DRAFT can be submitted; only IN_REVIEW can be approved; only APPROVED can be retired.
- The submitting user cannot approve their own plan (four-eyes control).
- Exercises can only be scheduled against an APPROVED plan.
- A PLANNED exercise must be started or cancelled; an IN_PROGRESS exercise must be completed or cancelled.
- Completion requires an explicit outcome and findings summary.
- Exercise records in terminal states cannot be changed.
- Actions are scoped through the exercise and plan; completion timestamps are maintained by the API.

## Limitations and boundaries

- Exercise execution is coordinated and recorded by users; no external exercise orchestration or live telemetry integration is claimed.
- The current plan editor stores structured narrative sections rather than a drag-and-drop runbook engine.
- Version creation is append-new-version; there is no in-place edit workflow for approved versions.
- PDF export, evidence file uploads, participant attendance, notification delivery and automated plan review reminders remain future enhancements.

## Verification

The mainline replacement is based on the current `main` branch and preserves the previously merged risk and dependency milestones.

CI is the source of truth for Prisma validation, migration deployment, API/web type checks, tests and builds. The milestone is not considered CI-verified until the GitHub Actions run for its pull request completes successfully.
