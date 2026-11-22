# Core Domain Model

This document defines the first-pass conceptual model. It is intentionally technology-neutral; the Prisma schema in Milestone 02 will translate these concepts into concrete tables, constraints and indexes.

## Organization and identity

- **Organization**: tenant boundary and owner of operational records.
- **User**: authenticated identity.
- **Membership**: user's relationship to an organization, including status and assigned roles.
- **Role / Permission**: named authorization bundles and individual capabilities.
- **Session**: revocable authentication session with refresh-token rotation metadata.

A user may belong to multiple organizations. Every request operates within one verified active membership context.

## Business and technology landscape

- **BusinessUnit**: organizational unit accountable for business activity.
- **Location**: physical or logical operating location.
- **BusinessService**: externally or internally delivered capability that matters to the organization.
- **BusinessProcess**: activity that supports one or more services.
- **Application**: software system supporting a process or service.
- **TechnologyAsset**: infrastructure or technology component.
- **Supplier**: external organization providing a product or service.
- **Dependency**: typed, directed relationship between supported entity types.

A dependency records its owner, criticality, verification date, evidence reference and lifecycle state. The initial graph is relational and tenant-scoped.

## Impact and recovery

- **BIAAssessment**: versioned assessment for a service or process.
- **ImpactProfile**: impact dimensions over elapsed time.
- **RecoveryObjective**: objective type (MTPD, RTO, RPO), value, unit, rationale and approval state.
- **CriticalityTier**: governed classification with an explicit policy definition.

Do not treat RTO, RPO and MTPD as interchangeable. Store units explicitly and validate domain-specific constraints.

## Risk and control

- **Risk**: a defined uncertainty/event that may affect objectives.
- **RiskAssessment**: likelihood, impact, scoring model version and rationale.
- **Control**: preventive, detective or corrective measure.
- **ControlAssessment**: effectiveness assessment with evidence and assessor.
- **Treatment**: accepted response, owner, due date and status.

Risk scoring must be configurable and versioned. A score without a documented method is not a defensible metric.

## Continuity, incident and recovery

- **ContinuityPlan**: approved strategy and response guidance for a service or process.
- **PlanVersion**: immutable approved snapshot.
- **Exercise**: planned test of a continuity or recovery capability.
- **ExerciseFinding**: gap, severity, owner and remediation.
- **Incident**: disruption record with severity, status, timeline and affected services.
- **IncidentTask**: assigned response action.
- **IncidentDecision**: recorded decision, actor, timestamp and rationale.
- **RecoveryPlan**: ordered recovery procedure with prerequisites and approval gates.
- **RecoveryStep**: action, owner, expected duration, dependency and execution outcome.

## Third-party resilience

- **SupplierAssessment**: time-bounded assessment of supplier resilience.
- **SupplierCommitment**: contractual or agreed recovery commitment, source and effective dates.
- **SupplierFinding**: identified gap and treatment action.

Supplier records link to services and dependencies. Supplier concentration analysis should be derived from those explicit links rather than manually maintained totals.

## Simulation and governance

- **Scenario**: disruption assumptions and impacted entity selectors.
- **SimulationRun**: immutable input snapshot, model version, outputs and execution status.
- **ImpactResult**: affected entities, propagation paths, severity and explanation.
- **Evidence**: metadata and controlled reference to supporting material.
- **AuditEvent**: append-oriented record of a material actor action.
- **Approval**: workflow decision with approver, timestamp and rationale.

Simulation output must always identify its assumptions and model version. It must not be presented as live monitoring data.

## Cross-cutting invariants

1. Every tenant-owned record is scoped to exactly one organization.
2. Every material record has a stable identifier and lifecycle timestamps.
3. Ownership is explicit for critical services, risks, plans and remediation actions.
4. Historical approvals and assessments are preserved as versions or immutable events.
5. Dependency traversal is cycle-safe and reports the path used.
6. Deletion of referenced operational records is restricted; archive or supersede where history matters.
7. Audit events do not contain credentials, tokens or unnecessary sensitive data.
8. All timestamps are stored in UTC; display timezone is a presentation concern.
