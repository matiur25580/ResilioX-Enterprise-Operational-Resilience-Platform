# Optional application screenshot capture

The README gallery currently contains twelve **illustrative SVG UI concepts**, not browser screenshots. They are fictional visual examples and must not be described as deployed screens or live telemetry. The SVG gallery remains the source of truth for the README until authentic application captures are reviewed and intentionally published.

This optional Playwright utility can capture the running local application as a separate set of PNG files. Captures are not automatically evidence of production readiness; review them for correct behavior, fictional data, privacy and visual quality before publishing. Do not overwrite the SVG concepts or represent an unverified screen as a shipped capability.

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

The script writes twelve PNG files to `docs/screenshots/`. Keep the SVG concept files unchanged. The capture is intentionally non-destructive: it navigates the application and opens forms but does not submit forms, approve plans or change exercise/action state.

Before publishing PNGs:
- use only a local fictional demo tenant and credentials;
- verify each captured workflow actually exists and works;
- review desktop and responsive layouts for clipping;
- remove secrets, personal data and any real customer information;
- update README labels and links only after the screenshots have been reviewed and verified.

Never use production credentials or real customer data for portfolio screenshots.
