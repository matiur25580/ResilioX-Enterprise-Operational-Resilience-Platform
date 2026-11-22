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
- Web workspace for supplier, contract and assessment management, including live status/error announcements and improved keyboard/screen-reader semantics for expandable actions and form guidance.

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
- Operational scoring rubric (all dimensions: 1–5, higher means greater risk): **1 Minimal** — current, independently reviewed evidence shows mature controls and no material gaps; **2 Low** — controls are established with minor, time-bound gaps; **3 Moderate** — partial controls or evidence gaps require tracked remediation; **4 High** — material control weaknesses, repeated findings or limited recovery assurance require a treatment plan and management visibility; **5 Critical** — severe or unmitigated weaknesses, failed recovery evidence or unacceptable concentration require escalation and explicit risk acceptance or dependency reduction.
- **Resilience risk** considers tested recovery capability, continuity arrangements, incident history and recovery evidence. **Security risk** considers security governance, access/data protection, vulnerability management and independent assurance. **Concentration risk** considers substitutability, correlated exposure, geographic/technology concentration and dependency criticality.
- Reviewers should record the rationale and evidence for each score, assign an owner and next-review date, and calibrate scores against organizational risk appetite. Missing evidence must not be treated as proof of effective controls; use a conservative score and document uncertainty. The rubric is guidance for consistent human assessment, not a validated quantitative model or automatic weighted score.
- Evidence is stored as a reference and metadata; files are not uploaded or independently verified by this module.
- Concentration exposure is calculated from verified dependency edges only; proposed, disputed or retired edges are excluded.
- Contractual RTO/RPO values represent recorded contract terms, not tested supplier recovery performance.
- Expiry reporting is a point-in-time view of contracts marked active/expiring with an expiry date inside the next 90 days; no background status scheduler is included.
- No supplier notification, external rating feed, contract-signature integration or automated compliance verdict is included.

## Verification and release gates

CI validates the Prisma schema and migration, generates Prisma Client, type-checks API/web, runs automated tests, audits production dependencies and builds both applications. The suite now includes a two-tenant supplier isolation integration test and a Chromium workflow covering sign-in, supplier registration, contract creation, assessment drafting, evidence recording and review submission. A focused accessibility pass adds alert/status announcements, expanded-state semantics, explicit multi-select guidance and clearer score-scale instructions. The score rubric is documented for consistent human review. Remaining release gates are a full assistive-technology/manual accessibility audit, broader multi-role and cross-tenant coverage, and formal approval of the rubric by the organization’s risk owner.
