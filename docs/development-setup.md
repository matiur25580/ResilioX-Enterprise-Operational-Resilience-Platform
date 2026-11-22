# Local Development

## Requirements
- Node.js 22 or newer
- npm 10 or newer
- Docker Engine / Docker Desktop with Compose

## Setup
1. Clone the repository.
2. Copy `.env.example` to `.env` in the repository root.
3. Set a unique `AUTH_TOKEN_SECRET` of at least 32 characters.
4. Start local dependencies with `docker compose up -d`.
5. Install workspace dependencies with `npm install`.
6. Generate the Prisma client with `npm run db:generate`.
7. Apply migrations with `npm run db:deploy` (or use `npm run db:migrate` for schema development).
8. Start the API with `npm run dev:api`.
9. In a second terminal, start the frontend with `npm run dev:web`.

The API listens on port 4000 and the web app on port 5173 by default. Set `CORS_ORIGIN=http://localhost:5173` in the root environment. The web app defaults to `http://localhost:4000/api/v1`; override it with `VITE_API_BASE_URL` in `apps/web/.env.local` if required.

## Optional demo tenant
The database seed is intentionally inert by default. For a local non-production demo:
1. Set `DEMO_SEED_ENABLED=true` in the root environment.
2. Set `DEMO_ADMIN_PASSWORD` to a unique password with at least 16 characters.
3. Optionally set `DEMO_ADMIN_EMAIL` and `DEMO_ORGANIZATION_SLUG`.
4. Run `npm run db:seed`.
5. Sign in at the web app with those credentials and the organization slug.

The demo dataset is fictional and is not a real integration or operational feed. The seed refuses to run when `NODE_ENV=production`.

## API endpoints
- `GET /api/v1/health/live`: process liveness.
- `GET /api/v1/health/ready`: PostgreSQL readiness.
- `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`: session lifecycle.
- `GET /api/v1/auth/me`: authenticated user and tenant context.
- `GET /api/v1/command-center/overview`: tenant-scoped command center data.

## Quality commands
- `npm run typecheck`
- `npm test`
- `npm run build`

## Troubleshooting
- If ports 5432, 6379, 4000 or 5173 are already in use, stop the conflicting service or change the local port configuration.
- If Prisma Client types are unavailable, run `npm run db:generate`.
- If environment validation fails, compare the local `.env` against `.env.example`.
- If browser requests fail, verify the API URL and the exact allowed `CORS_ORIGIN`.
