# Milestone 04 — Design System and Command Center

## Delivered
- React 19 + TypeScript + Vite web workspace, with responsive application shell and accessible navigation controls.
- Secure sign-in screen connected to the Milestone 03 login, refresh-cookie and identity endpoints.
- In-memory access-token handling; refresh token remains HttpOnly and is never exposed to browser JavaScript.
- Tenant-aware command center overview API. All service, inventory, dependency and audit queries are scoped using the authenticated membership's organization ID.
- KPI cards, business service portfolio table with client-side search, criticality distribution chart, inventory summary and recent audit activity.
- Explicit empty, loading and API error states. Modules not yet implemented are visibly marked as planned.
- Opt-in fictional demo tenant seed, disabled by default and blocked in production.
- Responsive layouts for desktop, tablet and mobile.
- API test asserting that command center data requires an authenticated session.

## Run locally
- Start the API using `npm run dev:api`.
- Start the web app using `npm run dev:web`.
- Set `VITE_API_BASE_URL=http://localhost:4000/api/v1` in `apps/web/.env.local` if the API is not at the default address.
- Configure the root `.env` with a strong `AUTH_TOKEN_SECRET` and `CORS_ORIGIN=http://localhost:5173`.

## Optional fictional demo data
Demo data is not inserted automatically. In a non-production environment only:
1. Set `DEMO_SEED_ENABLED=true`.
2. Set `DEMO_ADMIN_PASSWORD` to a unique password of at least 16 characters.
3. Optionally set `DEMO_ADMIN_EMAIL` and `DEMO_ORGANIZATION_SLUG`.
4. Run `npm run db:seed`.
5. Sign in with that email, password and organization slug.

The seed creates fictional Northstar Financial Group sample records. It does not connect to real suppliers or external systems. Never enable demo seeding in production.

## API contract
- `GET /api/v1/command-center/overview` — Bearer access token required.
- Response source is `tenant_database`; zero records produce honest zero/empty states rather than fabricated dashboard metrics.

## Scope boundaries
The dashboard currently summarizes the service catalog, dependency inventory, technology footprint, suppliers and audit activity. Incident, BIA, continuity plan, disaster recovery and simulation modules remain future roadmap work. No fake risk score, RTO/RPO, incident count, live integration status or synthetic telemetry is presented.
