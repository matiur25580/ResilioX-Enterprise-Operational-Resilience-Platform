# Milestone 12 — Scenario Simulation

## Outcome
Provide a reproducible, explainable planning engine that estimates which tenant-owned business services may be exposed when a recorded dependency is disrupted. This is decision support, not a live outage detector or recovery controller.

## Delivered scope
- Four scenario templates: critical service outage, critical supplier disruption, application degradation and technology asset loss.
- User-selected tenant-owned root node, disruption severity and duration (1–720 hours).
- Deterministic propagation over VERIFIED dependency edges only, with affected nodes and explicit dependency paths.
- Explainable service prioritization using recorded service criticality, graph depth, severity and duration.
- Approved continuity-plan RTO surfaced as a planning reference; missing RTO remains unknown.
- Versioned calculation model (1.0.0), explicit assumptions and point-in-time graph/output snapshot.
- Tenant-scoped run history stored as append-only audit events.
- Read access for authenticated members; scenario creation requires continuity:write.

## API
All endpoints are under /api/v1/scenarios:
- GET /templates — available scenario templates.
- GET /runs — latest 50 tenant-scoped simulation records.
- POST /runs — create a simulation from a tenant-owned root node.

Creation body: templateId, rootType, rootId, severity (DEGRADED or UNAVAILABLE), durationHours (integer 1–720), optional notes (max 2,000 chars). Organization is always derived from the authenticated membership, never from client input.

## Calculation model and limitations
- The engine respects dependency direction: business-service scenarios traverse source-to-target dependencies, while component, process, application, asset and supplier disruptions trace incoming dependents in reverse. Only VERIFIED relationships are traversed; undocumented relationships are not inferred.
- Priority is a heuristic score, not probability, expected loss, a regulatory metric or a recovery-time prediction. The score is deterministic for a fixed graph, model version and input.
- Only approved continuity-plan RTO values are surfaced. RTO is an objective recorded in a plan, not measured recovery performance.
- Graph and output snapshots preserve the evidence basis at run time; later dependency changes do not rewrite old runs.
- The graph traversal is bounded to 500 visited nodes.
- No cloud, network, database, identity, DNS, infrastructure, failover, restore, paging or notification action is executed.

## Verification and release gates
- Unit tests cover verified-edge propagation, non-verified-edge exclusion, deterministic output, criticality prioritization and input bounds.
- API integration coverage for all roles, tenant isolation and audit persistence remains required before release.
- UI/browser workflow and manual accessibility review remain release gates.
- CI must validate Prisma, run all tests, type-check, build, run dependency audit and CodeQL on the final PR head.
- This milestone does not claim production readiness, predictive accuracy, regulatory compliance or live recovery capability.
