# ContinuityGrid — Enterprise Operational Resilience Platform

> A unified operational resilience workspace for understanding critical services, mapping dependencies, quantifying business impact, managing disruption risk, and coordinating recovery.

**ContinuityGrid** is a portfolio-grade enterprise platform concept built with the PERN stack. It brings business continuity, operational risk, technology dependencies, third-party resilience, incident response, and disaster recovery into one traceable operating model.

> **Project status:** Milestones 01–07 have implementation in review branches; CI and review status are tracked per pull request. Pull requests and CI verification are tracked individually. Future capabilities remain planned until implemented and tested. Integrations and scenario data are explicitly labelled as simulated unless connected to a verified external system.

## Why ContinuityGrid?

Organizations often maintain business impact analyses, risk registers, application inventories, supplier assessments, continuity plans, and incident records in disconnected tools. That fragmentation makes it difficult to answer a critical question:

**If a business service is disrupted, what is affected, how severe is the impact, who owns the response, and what must recover first?**

ContinuityGrid is designed to connect those records through a shared service-and-dependency model.

## Product capabilities

| Domain | Capability |
| --- | --- |
| Executive command center | Resilience posture, critical service exposure, open incidents, overdue actions |
| Business impact analysis | MTPD, RTO, RPO, impact dimensions, criticality and review cycles |
| Service & dependency intelligence | Business services, processes, applications, infrastructure, locations and relationships |
| Operational risk | Risk assessments, control mapping, treatment plans and residual exposure |
| Business continuity | Continuity strategies, plans, exercises, approvals and evidence |
| Incident & crisis management | Incident lifecycle, severity, response teams, decisions, tasks and timelines |
| Disaster recovery | Recovery procedures, dependencies, runbooks, objectives and test evidence |
| Third-party resilience | Supplier criticality, service dependencies, assessments and concentration exposure |
| Scenario simulation | Disruption scenarios, impact propagation and recovery-priority modelling |
| Governance & assurance | Audit trail, evidence, approvals, policy acknowledgements and compliance mapping |
| Analytics | Operational metrics, trend analysis and exportable management reports |

## Technology direction

- **Frontend:** React 19, TypeScript, Vite, responsive CSS design system, Lucide icons and Recharts
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Validation & API contracts:** Zod and OpenAPI
- **Authentication:** Short-lived access tokens, rotating refresh sessions, secure password hashing
- **Authorization:** Tenant-aware RBAC and explicit resource-level access checks
- **Realtime:** Socket.IO for incident and collaboration updates
- **Background work:** Redis and BullMQ when asynchronous workloads are introduced
- **Testing:** Vitest, Supertest and Playwright
- **Delivery:** Docker, GitHub Actions and environment-based configuration

The initial architecture is a **modular monolith**. Domain boundaries are explicit, but deployment remains operationally simple until measured scale justifies service extraction.

## Architecture principles

1. Tenant isolation is enforced at the data-access boundary, not only in the UI.
2. Critical business actions are auditable and attributable to an actor.
3. Recovery objectives are stored with units, rationale, ownership and review history.
4. Dependency relationships are first-class records and support impact traversal.
5. Simulations are deterministic, reproducible and visibly distinguished from live telemetry.
6. External integrations are adapter-based; unavailable integrations never masquerade as connected systems.
7. API contracts, validation, error handling and authorization are consistent across modules.
8. Every important workflow has tests and documented acceptance criteria.

## Repository structure (target)

```text
continuitygrid/
├── apps/
│   ├── web/                 # React application
│   └── api/                 # Express API
├── packages/
│   ├── contracts/           # Shared schemas and API types
│   └── config/              # Shared lint/TypeScript configuration
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── docs/
│   ├── architecture.md
│   ├── domain-model.md
│   ├── security-and-privacy.md
│   ├── api-guidelines.md
│   └── roadmap.md
├── .github/workflows/
├── docker-compose.yml
├── .env.example
└── README.md
```

The web and API workspaces are now present. Shared contracts and configuration packages remain planned.

## Development roadmap

| Milestone | Scope | Status |
| --- | --- | --- |
| 01 | Product definition, architecture, repository standards | Completed |
| 02 | PostgreSQL schema, Prisma and API foundation | Completed (tooling advisory tracked) |
| 03 | Authentication, sessions, tenancy and RBAC | Implemented; CI passed, PR open |
| 04 | Design system, application shell and command center | Implemented; CI passed, PR open |
| 05 | Business impact analysis | Implemented; CI passed, PR open |
| 06 | Service and dependency intelligence | Implemented; CI passed, PR open |
| 07 | Operational risk and controls | Implemented; CI pending, PR open |
| 08 | Business continuity planning | Planned |
| 09 | Incident and crisis management | Planned |
| 10 | Disaster recovery orchestration | Planned |
| 11 | Third-party resilience | Planned |
| 12 | Scenario simulation engine | Planned |
| 13 | Governance, evidence and audit | Planned |
| 14 | Analytics and executive reporting | Planned |
| 15 | Notifications and realtime collaboration | Planned |
| 16 | Security review and automated test coverage | Planned |
| 17 | Performance, reliability and production hardening | Planned |
| 18 | Documentation, demo data and release readiness | Planned |

See [the detailed roadmap](docs/roadmap.md) and [architecture decision record](docs/architecture.md).

## Local development

See [the full-stack development guide](docs/development-setup.md). The short version is: copy `.env.example` to `.env`, set a unique `AUTH_TOKEN_SECRET`, start PostgreSQL/Redis with Docker Compose, run `npm install`, apply migrations, then start the API with `npm run dev:api` and the web app with `npm run dev:web`. The fictional demo seed is opt-in and refuses to run in production.

## Quality gates

A milestone is not considered complete merely because files compile. Acceptance includes:
- implementation matches the documented domain rules;
- validation and authorization are enforced server-side;
- migrations and seed data are repeatable;
- relevant unit and integration tests pass;
- critical user flows have end-to-end coverage;
- errors and empty states are handled;
- documentation reflects actual behavior.

## Security

Please report suspected vulnerabilities privately to the repository maintainer rather than opening a public issue containing exploit details. Security controls and disclosure instructions will be expanded as the application is implemented.

## License

No license has been selected yet. Until a license is added, standard copyright applies and reuse permissions are not granted by default.
