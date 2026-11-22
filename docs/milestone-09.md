# Milestone 09 — Incident and Crisis Management

**Status:** shipped to main in PR #12. This document records the delivered scope and the remaining follow-on items.

## Product objective

Provide one tenant-scoped command workspace to coordinate operational incidents from detection and triage through mitigation, recovery, closure and post-incident learning. Incidents should connect to the service/dependency inventory, business impact assessments and approved continuity plans already present in ResilioX.

## User outcomes

- Incident commanders can establish a shared operational picture and maintain an ordered decision timeline.
- Responders know their assignments, priorities, acknowledgements and due times.
- Service owners can see which critical business services and dependencies are affected.
- Executives can understand severity, business impact, current status and recovery progress.
- Assurance teams can reconstruct who decided and did what, and when.

## Functional scope

### 1. Incident record

Required fields:
- Tenant-owned immutable incident reference.
- Title, description, category and source.
- Severity: SEV-1, SEV-2, SEV-3 or SEV-4.
- Status: DETECTED, TRIAGED, ACTIVE, MITIGATING, RESOLVED, CLOSED, CANCELLED.
- Incident commander, reporter, created/updated timestamps, acknowledgedAt, resolvedAt and closedAt.
- Optional major-incident flag and declaredAt.

### 2. Lifecycle and controls

Proposed transitions:
- DETECTED → TRIAGED or CANCELLED.
- TRIAGED → ACTIVE or CANCELLED.
- ACTIVE → MITIGATING or RESOLVED.
- MITIGATING → ACTIVE or RESOLVED.
- RESOLVED → CLOSED or ACTIVE (reopen with rationale).
- CLOSED and CANCELLED are terminal; reopening a closed incident requires an explicit privileged action and a new audit event.

Severity changes, commander reassignment, major-incident declaration, resolution and closure require permission checks and a rationale. State changes and their timeline events must commit in the same database transaction.

### 3. Service and dependency impact

- Link incidents to one or more business services in the same organization.
- Resolve affected verified dependency paths using the existing graph model.
- Display each affected service's criticality and its approved continuity plan/RTO/RPO where available.
- Preserve a point-in-time impact snapshot so later graph edits do not rewrite incident history.
- Clearly distinguish manually declared impact from graph-derived potential impact.

### 4. Response team and action tracking

- Assign responders by user/membership and role.
- Track assignment state: ASSIGNED, ACKNOWLEDGED, DECLINED, RELEASED.
- Create tasks with owner, priority, dueAt, status, notes and completion metadata.
- Require a reason when a task is blocked or reassigned.
- Do not infer a user's availability or send notifications until a delivery provider is configured.

### 5. Timeline, decisions and post-incident review

- Append-only incident event timeline: status, severity, assignment, impact, task, decision and narrative update events.
- Decision records include decision maker, rationale, timestamp and optional evidence reference.
- Post-incident review captures summary, contributing factors, what went well, improvement opportunities and corrective actions.
- Timeline records are immutable to ordinary users; corrections are represented as additional events.

### 6. Executive analytics

- Open incidents by severity and age.
- Time to acknowledge, time to mitigate and time to resolve.
- Service impact by criticality.
- Reopened and recurring incident counts.
- SLA/target attainment only when the target definition and timestamp provenance are explicit.

## Proposed API surface

All endpoints are under `/api/v1/incidents` and require an authenticated organization context.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/summary` | Tenant incident KPIs |
| GET | `/` | Filterable incident register |
| POST | `/` | Declare an incident |
| GET | `/:incidentId` | Incident detail, impact and timeline |
| PATCH | `/:incidentId/status` | Governed lifecycle transition |
| PATCH | `/:incidentId/severity` | Severity change with rationale |
| POST | `/:incidentId/assignments` | Assign or release responders |
| POST | `/:incidentId/tasks` | Create response task |
| PATCH | `/:incidentId/tasks/:taskId` | Update task state/owner |
| POST | `/:incidentId/decisions` | Record an incident decision |
| POST | `/:incidentId/updates` | Append a situation update |
| POST | `/:incidentId/impact` | Link tenant-owned services and snapshot impact |
| POST | `/:incidentId/post-incident-review` | Record review and corrective actions |

Use bounded pagination and validated filters. Never accept organizationId from the request body as authorization context.

## Data model proposal

- `Incident`: organizationId, reference, title, description, category, source, severity, status, majorIncident, commanderUserId, reporterUserId, lifecycle timestamps.
- `IncidentEvent`: incidentId, actorUserId, eventType, fromValue, toValue, rationale, metadata, createdAt.
- `IncidentAssignment`: incidentId, userId, responseRole, state, assignedAt, acknowledgedAt, releasedAt.
- `IncidentTask`: incidentId, title, description, ownerUserId, priority, status, dueAt, completedAt.
- `IncidentServiceImpact`: incidentId, serviceId, impactLevel, impactSummary, declaredBy, snapshot JSON and createdAt.
- `IncidentDecision`: incidentId, decision, rationale, decisionMakerUserId, createdAt.
- `PostIncidentReview`: incidentId, summary, contributingFactors, positiveFindings, improvementAreas, reviewedBy, reviewedAt.

Every relation to a tenant-owned record must be validated against the active organization. Database uniqueness should enforce incident reference uniqueness per organization.

## Security, resilience and audit requirements

- Enforce RBAC server-side for declaration, severity changes, assignment, major-incident declaration, resolution and closure.
- Validate tenant ownership for incidents, users, services, plans and tasks.
- Use optimistic concurrency (version or updatedAt precondition) for concurrent command updates.
- Write audit/timeline events transactionally with the business mutation.
- Keep timeline append-only for ordinary roles.
- Make notification delivery asynchronous and idempotent; core incident writes must succeed independently of an external provider.
- Redact secrets and personal data from structured logs.
- Add request correlation IDs and bounded pagination.

## Verification and acceptance

- Unit tests for lifecycle transition matrix and severity ordering.
- API integration tests for authentication, role permissions and cross-tenant isolation.
- Tests for concurrent updates, duplicate task submissions and immutable timeline behavior.
- Tests proving service impact links cannot cross tenant boundaries.
- Frontend tests for empty/loading/error/permission states and responsive incident detail.
- Migration deployment, Prisma generation, typecheck, test suite and production build must pass in CI.
- No external paging, detection, SIEM or regulatory-reporting integration is claimed until implemented and verified.

## Industry context

The workflow is informed by DORA's ICT incident and response/recovery expectations, NIST CSF 2.0's Respond and Recover outcomes, and NIST SP 800-61 Rev. 3 incident-response guidance. These references guide product design; they do not imply certification or legal compliance.
