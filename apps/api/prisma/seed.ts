import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Reference data only. Tenant-specific demo data will be introduced after
  // identity and tenant isolation are implemented in Milestone 03.
  console.info('ContinuityGrid database seed completed: no tenant data is created yet.');
}

main()
  .catch((error: unknown) => {
    console.error('Database seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
