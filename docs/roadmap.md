# Delivery Roadmap

Milestones are delivered sequentially. Each milestone must leave the repository in a coherent, testable state. Scope may be refined as implementation reveals domain constraints.

## 01 — Product and repository foundation
**Deliverables**
- Product vision, personas, core workflows and explicit non-goals.
- Modular architecture and domain ownership.
- Security, tenancy, API and contribution standards.
- Milestone sequence and acceptance criteria.

**Acceptance**
- Architecture boundaries are documented.
- Planned versus implemented behavior is clearly distinguished.
- No unsupported claims of live integrations or production readiness.

## 02 — Backend, database and workspace foundation
**Deliverables**
- TypeScript monorepo/workspace structure.
- Express API bootstrap, configuration validation and error handling.
- PostgreSQL + Prisma schema baseline and migration workflow.
- Health/readiness endpoints, structured logging and seed strategy.
- Docker Compose for local dependencies and developer documentation.

**Acceptance**
- Clean install, migration and seed work from documented instructions.
- API starts with validated configuration.
- Automated smoke tests pass.

## 03 — Identity, sessions, tenancy and RBAC — Merged to main (PR #1)
**Deliverables**
- Registration/invitation strategy, login and logout.
- Secure password hashing and rotating refresh sessions.
- Organization membership and tenant context.
- Role and permission model, protected routes and audit events.

**Acceptance**
- Expired/revoked sessions fail.
- Cross-tenant reads and writes are denied and tested.
- Privileged operations enforce server-side permissions.

## 04 — Design system and command center — Merged to main (PR #7)
**Deliverables**
- Accessible application shell, navigation and responsive layouts.
- Reusable data table, forms, dialogs, filters, charts and status patterns.
- Command center backed by real API queries and clearly labelled seed data.

**Acceptance**
- Loading, empty, error and permission states are implemented.
- Core screens work on mobile and desktop.

## 05 — Business impact analysis — Merged to main (PR #8)
**Deliverables**
- Assessment lifecycle, impact dimensions and time horizons.
- MTPD, RTO and RPO fields with validation and rationale.
- Criticality classification, ownership and review workflow.

**Acceptance**
- Business rules and calculations have unit tests.
- Objective values retain units and review provenance.

## 06 — Service and dependency intelligence — Merged to main (PR #9; CI passed)
**Deliverables**
- Tenant-scoped business service/process/application/technology asset/supplier catalog (location catalog remains future scope).
- Typed dependency relationships and graph visualization.
- Impact traversal with cycle detection and explainable paths.

**Acceptance**
- Invalid relationships are rejected.
- Traversal is deterministic and tenant-scoped.

## 07 — Operational risk and controls — Merged to main (PR #10; CI passed)
- Control library, control assessments and treatment plans.
- Risk-to-service and risk-to-dependency mapping.

**Acceptance**
- Scoring model is documented and tested.
- Changes are auditable.

## 08 — Business continuity management — Merged to main (PR #11; CI passed)
**Deliverables**
- Continuity strategies and plans.
- Plan ownership, versioning, review and approval.
- Exercise schedule, results, findings and remediation actions.

**Acceptance**
- Approval transitions are permission-checked.
- Plan versions and exercise evidence are traceable.

## 09 — Incident and crisis management — Merged to main (PR #12)

Detailed design: [Milestone 09 specification](milestone-09.md).

**Product outcome:** give resilience, technology and business teams one governed command workflow from incident declaration through recovery and post-incident learning.

**Delivered:** tenant-scoped incident records, severity levels, guarded lifecycle transitions, commander ownership, response tasks, timeline events and audit events. PR #12 is merged; API quality gates passed.

**Deliverables**
- Incident register with unique reference, title, description, source, category, severity (SEV-1 to SEV-4), status, commander and timestamps.
- Governed lifecycle: DETECTED → TRIAGED → ACTIVE → MITIGATING → RESOLVED → CLOSED, with explicit cancellation and reopen rules.
- [ ] Impact mapping to tenant-owned business services and affected dependency paths (next increment).
- [ ] Response team roster with role, assignment time and acknowledgement state (next increment).
- Time-ordered event timeline for status changes, decisions, updates and evidence references.
- Action/task tracking with owner, priority, due time, status and completion notes.
- Major-incident declaration, decision log and post-incident review with corrective actions.
- Executive incident metrics: open by severity, time to acknowledge, time to mitigate, recurrence and service impact.
- [ ] Notification adapter boundary with retry/idempotency semantics; no live paging integration until a provider is configured.

**Acceptance**
- Every query and mutation is scoped to the authenticated organization.
- Only authorized roles can declare, assign, change severity or close an incident.
- State transitions are validated server-side and recorded atomically with audit events.
- Timeline ordering is deterministic and immutable to ordinary workspace users.
- Task ownership, due dates and completion are auditable.
- Duplicate webhook/event delivery is safe; external notifications never block the core incident transaction.
- API and UI cover loading, empty, permission-denied and failure states.
- Integration tests cover cross-tenant access, invalid transitions, maker-checker decisions where required and event history integrity.

## 10 — Disaster recovery orchestration — implementation in draft PR; release acceptance pending
**Delivered in this increment**
- Tenant-scoped runbook schema, ordered steps, dependency graph and PostgreSQL migration.
- Runbook creation, register/detail, submission, maker-checker approval, retirement and immutable version cloning APIs.
- Simulation creation, register/detail, prerequisite acknowledgement, guarded step outcomes, cancellation and completion APIs.
- Point-in-time service-dependency and runbook-step snapshots.
- Step validation records, evidence references and tenant-validated links to incident remediation tasks.
- RTO/RPO comparisons that preserve unknown targets; failed or inconclusive validations produce a blocked rehearsal.
- Responsive workspace UI for runbook authoring, approval, retirement, version cloning, simulations, validations and remediation links.
- Unit policy tests and unauthenticated-route tests.

**Release hardening still required**
- CI and CodeQL must pass on the final PR head; reviewer approval and merge remain outstanding.
- Add authenticated multi-tenant integration coverage for role matrix, maker-checker, tenant-bound service/plan/incident/task references, concurrency and audit atomicity.
- Browser-level UI tests, accessibility review and production operational acceptance remain separate release gates.

**Acceptance boundary**
- No infrastructure action is invoked; every run is a rehearsal only.
- Approved versions are not edited in place; a new draft version is cloned.
- Simulation evidence is operator-entered and does not prove live recovery capability.

## 11 — Third-party resilience
**Deliverables**
- Supplier and service catalog, criticality and assessments.
- Contractual recovery commitments and evidence.
- Supplier concentration and dependency exposure views.

**Acceptance**
- Supplier relationships connect to business services.
- Assessment history is preserved.

## 12 — Scenario simulation
**Deliverables**
- Scenario templates, assumptions and configurable disruptions.
- Dependency-based impact propagation.
- Recovery prioritization and reproducible simulation runs.

**Acceptance**
- Same inputs and model version produce repeatable results.
- Output includes assumptions, affected paths and limitations.

## 13 — Governance, evidence and audit
**Deliverables**
- Append-only audit event model for critical actions.
- Evidence register, approvals and policy mapping.
- Searchable governance history.

**Acceptance**
- Audit events identify actor, tenant, action, target and timestamp.
- Sensitive values are excluded from logs.

## 14 — Analytics and executive reporting
**Deliverables**
- Service resilience scorecards with transparent formulas.
- Trend views and configurable reports.
- CSV/PDF export with tenant authorization.

**Acceptance**
- Metrics have definitions and data provenance.
- Exports respect the same access scope as the UI.

## 15 — Notifications and realtime collaboration
**Deliverables**
- In-app notifications and preferences.
- Realtime incident updates.
- Delivery retry and failure visibility.

**Acceptance**
- Reconnect and duplicate-delivery behavior are tested.
- Notification failures do not corrupt core transactions.

## 16 — Security and test hardening
**Deliverables**
- Threat-model review, dependency audit and secure headers.
- Rate limiting, input validation and abuse protections.
- Unit, integration, end-to-end and authorization test expansion.

**Acceptance**
- Critical security scenarios are covered.
- No known high-severity release blocker remains unresolved.

## 17 — Performance and production readiness
**Deliverables**
- Query/index review, pagination and caching where justified.
- Backup/restore runbook, observability and operational checklists.
- Container and CI optimization.

**Acceptance**
- Performance targets are measured and documented.
- Recovery procedures are rehearsed in a non-production environment.

## 18 — Documentation and release readiness
**Deliverables**
- Complete setup, architecture, API and user documentation.
- Demo tenant and realistic but fictional seed dataset.
- Screenshots, walkthrough and release notes.
- Manual deployment checklist.

**Acceptance**
- A new contributor can run the project from a clean checkout.
- Demo data is clearly fictional.
- No deployment is performed without explicit owner action.
