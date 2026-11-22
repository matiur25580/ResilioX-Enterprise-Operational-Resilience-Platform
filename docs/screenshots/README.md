# ResilioX dashboard screenshot capture guide

The root README defines a **12-image, single-column gallery**. Each image should be a genuine capture from the running React application, with its editorial caption directly below it.

## Run from GitHub Actions

After deploying a synthetic demo workspace, add repository Actions secrets `DEMO_EMAIL` and `DEMO_PASSWORD`. Open **Actions → Capture dashboard showcase → Run workflow**, then provide the deployed base URL and workspace slug. The workflow installs dependencies with `npm install` (this repository does not commit a root package lock), installs Chromium, captures the twelve real screens, validates every expected PNG, and commits the images to `main`. Never use production credentials or customer data.

## Capture a local or preview workspace

Use a synthetic demo tenant only. Do not use production credentials or real customer records.

```bash
npm install
npx playwright install chromium
export SHOWCASE_BASE_URL=http://localhost:5173
export SHOWCASE_EMAIL=demo-admin@example.test
export SHOWCASE_PASSWORD='your-local-demo-password'
export SHOWCASE_TENANT='your-demo-workspace'
npm run capture:showcase
```

The capture script writes PNGs to this directory at a consistent 1440 × 1000 viewport. It signs in, navigates the dashboard and captures the following sequence:

1. `01-command-center.png` — executive resilience overview and portfolio KPIs.
2. `02-service-portfolio.png` — searchable service inventory and criticality.
3. `03-business-impact-analysis.png` — recovery objectives and impact assessment.
4. `04-dependency-intelligence.png` — service dependencies and relationship assurance.
5. `05-dependency-workflow.png` — dependency capture and verification workflow.
6. `06-risk-register.png` — inherent/residual risk and accountable ownership.
7. `07-incident-response.png` — severity, incident lifecycle and response timeline.
8. `08-control-assurance.png` — control library and evidence-backed testing.
9. `09-continuity-workspace.png` — continuity posture and exercise schedule.
10. `10-continuity-plan-builder.png` — plan activation, recovery and communication sections.
11. `11-exercise-management.png` — approved-plan exercise scheduling and scenario objectives.
12. `12-remediation-tracker.png` — findings, owners, due dates and remediation status.

## Review before committing

- Confirm each capture reflects the current main branch and the intended screen.
- Prefer populated synthetic records; avoid empty-state captures unless that is the point being demonstrated.
- Remove browser chrome and keep viewport, zoom, theme and workspace consistent.
- Inspect every image for credentials, email addresses, organization IDs, access tokens or other sensitive data.
- Do not draw, generate or edit mock UI and present it as a product screenshot.
- Commit the 12 reviewed PNG files to this directory, then replace the README's capture-manifest paths with Markdown image embeds in numeric order.

**Current repository state:** the capture script and 12-view editorial manifest are committed; the 12 genuine PNG files have not yet been captured because no authenticated running demo URL and temporary demo account were supplied.
