# Milestone 10 — Disaster Recovery Orchestration

**Status:** design baseline prepared; implementation is the next delivery increment.

## Product objective

Give resilience and technology teams a governed way to prepare, approve, simulate and review disaster-recovery runbooks for business services. The workflow connects approved continuity plans, service dependencies, recovery objectives and incident response without claiming to execute infrastructure changes.

## Product boundary

- The initial release is **simulation-only**. A runbook execution records operator decisions and simulated step outcomes; it does not call cloud, infrastructure, database, identity or network control planes.
- No automatic failover, data restoration, DNS change, infrastructure provisioning or external paging is implied.
- Real execution requires a separately reviewed adapter, explicit tenant configuration, least-privilege credentials, approval gates, idempotency, dry-run support and auditable rollback behavior.
- RTO/RPO values are targets from approved continuity/BIA records, not guarantees that a simulation has met them.

## User outcomes

- Recovery owners can maintain versioned, service-linked recovery runbooks.
- Reviewers can approve a specific immutable runbook version before it is used.
- Incident commanders can launch a simulation from an incident or continuity plan and see prerequisites, step outcomes and elapsed time.
- Operators can record evidence, blockers, decisions and recovery validation.
- Executives can compare simulated recovery duration with approved RTO/RPO targets and see assumptions and gaps.

## Functional scope

### 1. Recovery runbooks

A runbook belongs to one organization and one business service. It contains:
- Name, purpose, scope, owner and review date.
- Optional links to an approved continuity plan and its version.
- Declared RTO/RPO targets with units and provenance.
- Ordered recovery steps with title, description, responsible role, estimated duration, prerequisites and validation criteria.
- Explicit dependencies between steps; cycles are rejected.
- Version number and lifecycle: DRAFT → IN_REVIEW → APPROVED → RETIRED.

Editing an approved runbook creates a new draft version; it must not mutate the approved version used by an existing simulation.

### 2. Approval and governance

- Only OWNER, ADMIN and RESILIENCE_MANAGER can submit, approve or retire runbooks.
- The author cannot approve their own submission (maker-checker).
- Approval records reviewer, timestamp, approved version and optional rationale.
- Only an approved, non-retired version can start a simulation.
- Every lifecycle transition is written to the audit log in the same transaction as the state change.

### 3. Recovery simulation

A simulation references an immutable runbook version and may optionally reference an incident.
- States: PLANNED → READY → RUNNING → COMPLETED, with BLOCKED and CANCELLED terminal outcomes for that run.
- Starting requires all mandatory prerequisites to be acknowledged and a valid approval.
- Each step records PENDING, READY, IN_PROGRESS, SUCCEEDED, FAILED, BLOCKED or SKIPPED.
- A step can start only after all prerequisite steps have succeeded or been explicitly waived with a rationale by an authorized operator.
- Step completion requires an outcome summary; failed/blocked/waived steps require rationale.
- Record started/completed timestamps, operator, duration, evidence reference and simulated outcome.
- A simulation is a record of a tabletop or controlled rehearsal, not proof of real recovery capability.

### 4. Service and dependency context

- Validate that service, continuity plan and incident all belong to the authenticated organization.
- Show verified dependency paths and identify upstream/downstream services relevant to the runbook.
- Capture a point-in-time dependency snapshot at simulation start so later graph changes do not rewrite the historical exercise.
- Flag missing owners, unverified dependencies and missing recovery objectives as readiness warnings; do not silently invent values.

### 5. Recovery validation and reporting

- Capture validation checks for service availability, data integrity, business-owner sign-off and communications readiness.
- Record actual simulated elapsed time separately from target RTO.
- Record data-loss assumptions and simulated recovery point separately from target RPO.
- Produce a summary of successful, failed, blocked and waived steps, unresolved risks and corrective actions.
- Allow a completed simulation to create owner-assigned remediation actions with severity and due date.

## Proposed API surface

All routes are under `/api/v1/recovery` and require authenticated tenant context.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/runbooks` | Tenant-scoped runbook register with bounded filters |
| POST | `/runbooks` | Create a draft runbook and ordered steps |
| GET | `/runbooks/:id` | Read runbook and version history |
| PATCH | `/runbooks/:id` | Edit a draft; approved versions remain immutable |
| POST | `/runbooks/:id/submit` | Submit a draft for review |
| POST | `/runbooks/:id/approve` | Approve a submitted version using maker-checker |
| POST | `/runbooks/:id/retire` | Retire a runbook version |
| GET | `/simulations` | List simulations and outcomes |
| POST | `/simulations` | Create a simulation from an approved runbook version |
| GET | `/simulations/:id` | Read simulation, steps, evidence and timeline |
| POST | `/simulations/:id/start` | Start after readiness checks |
| PATCH | `/simulations/:id/steps/:stepId` | Record simulated step progress/outcome |
| POST | `/simulations/:id/complete` | Complete after required validation |
| POST | `/simulations/:id/cancel` | Cancel with rationale |
| POST | `/simulations/:id/actions` | Create remediation from a simulation finding |

## Data model proposal

- `RecoveryRunbook`: organizationId, serviceId, title, description, ownerName, version, status, reviewDueAt, submittedAt, approvedAt, approvedBy, createdAt, updatedAt.
- `RecoveryRunbookStep`: runbookId, sequence, title, description, responsibleRole, estimatedMinutes, validationCriteria, createdAt.
- `RecoveryStepDependency`: predecessorStepId, successorStepId; enforce same-runbook ownership and acyclic ordering.
- `RecoverySimulation`: organizationId, runbookId, runbookVersion, incidentId?, status, startedAt, completedAt, targetRtoMinutes, targetRpoMinutes, simulatedElapsedMinutes, dataLossAssumptionMinutes, dependencySnapshot JSON, summary.
- `RecoverySimulationStep`: simulationId, runbookStepId, status, operatorName, startedAt, completedAt, outcome, rationale, evidenceReference.
- `RecoveryValidation`: simulationId, validationType, status, checkedBy, checkedAt, notes.
- `RecoveryEvent`: simulationId, actorUserId, eventType, message, metadata, createdAt.

All tenant-owned relations must be validated against the active organization. Use database constraints for uniqueness and foreign keys wherever possible; use application validation for polymorphic references and graph acyclicity.

## Security, consistency and resilience

- Never accept organizationId as authorization context from request data.
- Apply RBAC on every write route; read access remains tenant-scoped.
- Use maker-checker for runbook approval.
- Use optimistic concurrency for concurrent runbook and simulation updates.
- Write state changes, event timeline entries and audit events in a single database transaction.
- Keep approved runbook versions and simulation history immutable; corrections are new events or new versions.
- Bound runbook step counts, graph traversal depth, pagination and evidence-reference lengths.
- Do not store secrets or raw credentials in runbooks, evidence references or logs.
- Simulation actions must never call external infrastructure systems.
- If a real adapter is introduced later, isolate it behind an explicit interface and require dry-run, idempotency, scoped credentials, approvals, timeouts, compensation strategy and operator-visible failure handling.

## Acceptance and verification

- Unit tests cover lifecycle transition matrices, step prerequisites, dependency-cycle rejection and RTO/RPO comparison.
- API tests cover authentication, role enforcement, maker-checker, tenant isolation for service/plan/incident references, and immutable approved versions.
- Simulation tests cover blocked prerequisites, failed steps, explicit waivers, cancellation, duplicate submissions and concurrent updates.
- Audit tests prove that every state mutation and event commit atomically.
- Frontend tests cover loading, empty, error, permission-denied, readiness-warning and mobile states.
- CI must generate Prisma, apply migrations against PostgreSQL, type-check, test and build both workspaces.
- Documentation and UI must state prominently that the first release is simulation-only.

## Delivery sequence

1. Schema and migration for runbook versions, ordered steps, simulations, validations and events.
2. Pure domain policies for lifecycle, maker-checker, step prerequisites and simulation readiness.
3. Tenant-scoped API routes and integration tests.
4. Recovery workspace UI: runbook register/editor, approval queue and simulation console.
5. Executive comparison of simulated recovery against RTO/RPO, with assumptions and evidence.
6. README, API documentation, seed fixtures and release notes.

## Industry context

The workflow is informed by DORA ICT business continuity and recovery expectations, NIST CSF 2.0 Recover outcomes and ISO 22301 continuity planning practices. These references inform product design only; the platform does not certify regulatory compliance or guarantee recovery objectives.
