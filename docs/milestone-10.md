# Milestone 10 — Disaster Recovery Orchestration

**Status:** implementation delivered in draft PR; CI verification and review are pending. Deployment and production acceptance have not been performed.

## Scope and safety boundary

This milestone provides governed recovery runbooks and rehearsal-only simulations for tenant business services. It does not execute infrastructure recovery, automatic failover, data restoration, DNS/network changes, cloud provisioning or external paging. RTO/RPO assessments use operator-entered rehearsal values and are not proof of live recovery capability.

## Delivered capabilities

### Runbook governance
- Tenant-scoped runbook register and detail reads.
- Draft creation with ordered steps, role ownership, estimates, validation criteria and prerequisite edges.
- Dependency-cycle and invalid-step-reference rejection.
- Optional link to an approved continuity plan for the same service; linked RTO/RPO values are inherited.
- Submit, independent maker-checker approval, retirement and new draft version cloning.
- Approved versions are not edited in place; cloning preserves the source version and its step prerequisites.
- Audit events are committed with lifecycle changes.

### Rehearsal simulation
- Create a simulation from an approved runbook version and optionally link an incident in the same tenant.
- Capture a point-in-time snapshot of service dependency edges and runbook step prerequisites at simulation creation.
- Explicit prerequisite acknowledgement before start.
- Guarded step lifecycle, prerequisite enforcement and required rationale for failed, blocked or waived steps.
- Operator-entered outcome, validation evidence and optional link to an incident remediation task.
- Step validation records support PASS, FAIL and INCONCLUSIVE results; failed or inconclusive validations close the rehearsal as BLOCKED.
- Completion records simulated elapsed time and assumed data loss, then compares both with known RTO/RPO targets. Missing targets remain UNKNOWN rather than being treated as zero.
- Cancellation requires a rationale; all mutations create timeline and audit records transactionally.

### Workspace UI
- Recovery navigation entry with responsive runbook register and editor.
- Approved continuity-plan selector, review/approval/retirement and version-cloning actions.
- Rehearsal creation, incident association, step progression, evidence capture, remediation linking and completion summary.
- Readiness-gap notices for missing owners and recovery objectives.
- Prominent simulation-only warning.

## API surface

All routes are mounted under `/api/v1/recovery`. Reads require authentication and are tenant-scoped; writes additionally require `continuity:write`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/runbooks` | List runbooks with status/service filters and bounded limit |
| GET | `/runbooks/:runbookId` | Read runbook, service/plan context and simulation history |
| POST | `/runbooks` | Create a draft with ordered steps and dependencies |
| POST | `/runbooks/:runbookId/submit` | Submit draft for review |
| POST | `/runbooks/:runbookId/approve` | Approve with maker-checker protection |
| POST | `/runbooks/:runbookId/retire` | Retire an approved version with rationale |
| POST | `/runbooks/:runbookId/versions` | Clone approved/retired version into a new draft |
| GET | `/simulations` | List tenant simulations |
| GET | `/simulations/:simulationId` | Read simulation, steps, validations and event timeline |
| POST | `/simulations` | Create rehearsal from an approved runbook |
| POST | `/simulations/:simulationId/start` | Start after prerequisite acknowledgement |
| PATCH | `/simulations/:simulationId/steps/:stepId` | Record step state, outcome and remediation link |
| POST | `/simulations/:simulationId/steps/:stepId/validations` | Append validation evidence |
| POST | `/simulations/:simulationId/complete` | Close rehearsal and assess RTO/RPO |
| POST | `/simulations/:simulationId/cancel` | Cancel with rationale |

## Data model

- `RecoveryRunbook`, `RecoveryRunbookStep`, `RecoveryStepDependency`
- `RecoverySimulation`, `RecoverySimulationStep`, `RecoveryStepValidation`, `RecoveryEvent`
- Simulation steps may link to an existing incident task as a remediation follow-up. The API validates the task belongs to the same tenant and, when an incident is attached, to that incident.

## Verification and remaining release gates

- Unit tests cover lifecycle policies, maker-checker, dependency cycles, prerequisites and RTO/RPO comparisons.
- API tests cover unauthenticated access to all read/write route families.
- CI applies the Prisma migration against PostgreSQL, generates Prisma Client, type-checks API and web workspaces, runs tests and builds the application.
- CodeQL scans TypeScript.
- Full authenticated multi-tenant integration tests, role matrix tests, browser-level frontend tests, accessibility review, seed fixtures and production operational acceptance remain additional release-hardening work.
- Do not deploy until CI and CodeQL pass and the draft PR is reviewed and merged through the repository's normal process.

## Operational note

A real recovery executor would require a separate security design: explicit adapter interfaces, tenant-scoped least-privilege credentials, dry-run, approvals, idempotency, timeouts, rollback/compensation and independent audit controls. None of those external execution capabilities are part of this milestone.
