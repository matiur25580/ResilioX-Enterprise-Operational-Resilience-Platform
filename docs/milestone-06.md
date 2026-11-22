# Milestone 06 — Service and Dependency Intelligence

## Delivered scope

- Tenant-scoped node catalog spanning business services, business processes, applications, technology assets and suppliers.
- Typed, directed dependency edges with criticality, confidence, proposed/verified/disputed/retired states.
- Endpoint existence and tenant ownership validation for both ends of every new edge.
- Self-reference, duplicate typed-edge and directed-cycle rejection.
- Controlled status transitions with optimistic concurrency protection and audit events.
- Deterministic breadth-first traversal of verified edges only, with a 200-node safety limit.
- Dependency register, verification workflow and selected-node path explorer in the React workspace.
- Command-center capability metadata now reports dependency intelligence as available.

## API

- `GET /api/v1/dependencies/nodes` — catalog nodes for the authenticated tenant.
- `GET /api/v1/dependencies` — latest 500 dependency edges; optional `?status=PROPOSED|VERIFIED|DISPUTED|RETIRED`.
- `POST /api/v1/dependencies` — propose a typed relationship.
- `PATCH /api/v1/dependencies/:dependencyId/status` — verify, dispute or retire a relationship through allowed transitions.
- `GET /api/v1/dependencies/graph?nodeType=APPLICATION&nodeId=<uuid>` — outgoing verified graph traversal.

All endpoints require an authenticated session. Mutations require `continuity:write`; every query is scoped to the authenticated organization. Node ownership is checked in the service layer because the current catalog uses polymorphic node references rather than foreign keys.

## Graph semantics

Edges are directed from source to target. The path explorer follows outgoing verified edges, not proposed or disputed relationships. A breadth-first traversal and stable database ordering produce deterministic output. Cycle detection checks active (non-retired) edges before accepting a proposed relationship. Traversal is capped at 200 unique nodes and reports truncation rather than silently implying a complete graph.

## Scope boundaries

This milestone uses the five node types already present in the repository schema. A first-class location catalog, edge-specific direction rules, graph editing canvas, pagination beyond the 500-edge register window, and transaction-safe graph mutation retries are not included. Relationship types remain typed metadata and are not yet used to infer recovery behavior.

## Verification

The CI workflow validates Prisma, generates the client, applies migrations, type-checks API and web workspaces, runs tests and builds both workspaces. Mark this milestone CI-verified only after the current pull request head passes all gates.
