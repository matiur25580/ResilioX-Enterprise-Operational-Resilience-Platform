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

## 03 — Identity, sessions, tenancy and RBAC — Implemented (CI passed; PR pending merge)
**Deliverables**
- Registration/invitation strategy, login and logout.
- Secure password hashing and rotating refresh sessions.
- Organization membership and tenant context.
- Role and permission model, protected routes and audit events.

**Acceptance**
- Expired/revoked sessions fail.
- Cross-tenant reads and writes are denied and tested.
- Privileged operations enforce server-side permissions.

## 04 — Design system and command center — Implemented (CI passed; PR open)
**Deliverables**
- Accessible application shell, navigation and responsive layouts.
- Reusable data table, forms, dialogs, filters, charts and status patterns.
- Command center backed by real API queries and clearly labelled seed data.

**Acceptance**
- Loading, empty, error and permission states are implemented.
- Core screens work on mobile and desktop.

## 05 — Business impact analysis — Implemented (PR #3 open; latest CI revision pending)
**Deliverables**
- Assessment lifecycle, impact dimensions and time horizons.
- MTPD, RTO and RPO fields with validation and rationale.
- Criticality classification, ownership and review workflow.

**Acceptance**
- Business rules and calculations have unit tests.
- Objective values retain units and review provenance.

## 06 — Service and dependency intelligence — Merged to main (PR #9; CI passed)n progress (stacked PR pending CI)
**Deliverables**
- Tenant-scoped business service/process/application/technology asset/supplier catalog (location catalog remains future scope).
- Typed dependency relationships and graph visualization.
- Impact traversal with cycle detection and explainable paths.

**Acceptance**
- Invalid relationships are rejected.
- Traversal is deterministic and tenant-scoped.

## 07 — Operational risk and controls — Implemented in mainline PR (CI pending)nd inherent/residual scores.
- Control library, control assessments and treatment plans.
- Risk-to-service and risk-to-dependency mapping.

**Acceptance**
- Scoring model is documented and tested.
- Changes are auditable.

## 08 — Business continuity management
**Deliverables**
- Continuity strategies and plans.
- Plan ownership, versioning, review and approval.
- Exercise schedule, results, findings and remediation actions.

**Acceptance**
- Approval transitions are permission-checked.
- Plan versions and exercise evidence are traceable.

## 09 — Incident and crisis management
**Deliverables**
- Incident lifecycle, severity, timeline, tasks and decisions.
- Response team assignments and service impact links.
- Realtime updates and notification hooks.

**Acceptance**
- State transitions are validated.
- Incident actions are auditable and idempotent where required.

## 10 — Disaster recovery orchestration
**Deliverables**
- Recovery plans, ordered steps, prerequisites and owners.
- RTO/RPO alignment and test evidence.
- Approval gates for high-impact actions.

**Acceptance**
- Execution is simulated unless a real adapter is explicitly configured.
- Failed and blocked steps are visible and recoverable.

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
