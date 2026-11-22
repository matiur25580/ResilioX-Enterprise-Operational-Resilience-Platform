# Local Backend Development

## Requirements
- Node.js 22 or newer
- npm 10 or newer
- Docker Engine / Docker Desktop with Compose

## Setup
1. Clone the repository.
2. Copy `.env.example` to `.env` in the repository root.
3. Start local dependencies with `docker compose up -d`.
4. Install workspace dependencies with `npm install`.
5. Generate the Prisma client with `npm run db:generate`.
6. Create and apply the first local migration with `npm run db:migrate`.
7. Start the API with `npm run dev:api`.

The API listens on port 4000 by default.

## Health endpoints
- `GET /api/v1/health/live`: process liveness; does not require the database.
- `GET /api/v1/health/ready`: readiness check; verifies PostgreSQL connectivity.

## Quality commands
- `npm run typecheck`
- `npm test`
- `npm run build`

## Database notes
The initial Prisma schema establishes tenant, membership and service-catalog foundations. Domain-specific tables will be expanded in subsequent milestones. The current seed intentionally creates no organization or user records before the authentication and tenant provisioning rules exist.

## Troubleshooting
- If port 5432 or 6379 is already in use, stop the conflicting local service or adjust the Compose port mapping and matching connection URL.
- If Prisma Client types are unavailable, run `npm run db:generate`.
- If environment validation fails, compare the local `.env` against `.env.example`.
