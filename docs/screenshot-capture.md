# Dashboard screenshot capture

The README reserves a single-column gallery for twelve authentic application screenshots. The images must be captured from a running ContinuityGrid instance using fictional demo data. Do not substitute generated mockups or screenshots containing real customer data.

## Capture

From the repository root:

```bash
npm install
npx playwright install chromium
export SHOWCASE_BASE_URL=http://localhost:5173
export SHOWCASE_EMAIL=admin@continuitygrid.local
export SHOWCASE_PASSWORD='your-local-demo-password'
export SHOWCASE_TENANT=continuitygrid-demo
npm run capture:showcase
```

The script creates:

1. `01-command-center.png`
2. `02-service-portfolio.png`
3. `03-business-impact-analysis.png`
4. `04-dependency-intelligence.png`
5. `05-dependency-workflow.png`
6. `06-risk-register.png`
7. `07-risk-identification.png`
8. `08-control-assurance.png`
9. `09-continuity-workspace.png`
10. `10-continuity-plan-builder.png`
11. `11-exercise-management.png`
12. `12-remediation-tracker.png`

The capture is intentionally non-destructive: it navigates the application and opens forms but does not submit forms, approve plans or change exercise/action state. To show populated exercise and remediation states, prepare a fictional approved plan and completed exercise with actions before capture.

Review the PNGs at desktop size, verify responsive content is not clipped, remove any sensitive values, then commit them to `docs/screenshots/`. The README image references resolve once those captures are committed.
