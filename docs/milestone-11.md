# Milestone 11 — Third-party resilience

## Scope

Milestone 11 adds a tenant-scoped supplier register, contractual recovery commitments, evidence-backed supplier assessments and a view of verified supplier-to-service exposure.

## Delivered in this increment

- Supplier register with criticality, website and contact metadata.
- Contract register with owner, status, effective/expiry dates, renewal notice, contractual RTO/RPO, service-credit, exit-assistance and data-return terms.
- Contract links to business services, validated against the active organization before persistence.
- Versioned supplier assessments with resilience, security and concentration risk scores (1–5, where 5 is higher risk), rationale and next-review date.
- Assessment evidence references with type, source/reference and optional expiry date.
- Maker-checker assessment lifecycle: draft → in review → approved; the creator cannot approve their own assessment. Approval requires at least one evidence reference and supersedes the prior approved version.
- Audit events for supplier creation, contract creation, assessment creation/submission/approval and evidence recording.
- Supplier exposure summary based only on verified dependency edges, with linked-service, dependency and active-contract counts.
- Web workspace for supplier, contract and assessment management.

## API

All routes are mounted under `/api/v1/suppliers`. Reads require an authenticated session; mutations also require `continuity:write`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/` | Tenant supplier register with contract and assessment history |
| GET | `/summary` | Supplier concentration and contractual exposure summary |
| POST | `/` | Register supplier |
| POST | `/:supplierId/contracts` | Add contract and service links |
| POST | `/:supplierId/assessments` | Create a new assessment version |
| POST | `/assessments/:assessmentId/submit` | Submit draft for independent review |
| POST | `/assessments/:assessmentId/approve` | Approve as a different user with evidence present |
| POST | `/assessments/:assessmentId/evidence` | Record evidence reference on a draft/in-review assessment |

## Data and scoring boundaries

- All supplier reads and writes are scoped by the authenticated organization.
- Contract service IDs are checked against the same organization before links are created.
- Assessment scores are human-entered risk ratings, not automated security certification or a claim of supplier compliance.
- Evidence is stored as a reference and metadata; files are not uploaded or independently verified by this module.
- Concentration exposure is calculated from verified dependency edges only; proposed, disputed or retired edges are excluded.
- Contractual RTO/RPO values represent recorded contract terms, not tested supplier recovery performance.
- Expiry reporting is a point-in-time view of contracts marked active/expiring with an expiry date inside the next 90 days; no background status scheduler is included.
- No supplier notification, external rating feed, contract-signature integration or automated compliance verdict is included.

## Verification and release gates

CI validates the Prisma schema and migration, generates Prisma Client, type-checks API/web, runs automated tests, audits production dependencies and builds both applications. The suite now includes a two-tenant supplier isolation integration test and a Chromium workflow covering sign-in, supplier registration, contract creation, assessment drafting, evidence recording and review submission. Remaining release gates are broader multi-role and cross-tenant coverage, a dedicated accessibility audit and operational review of scoring definitions.
