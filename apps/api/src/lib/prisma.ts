import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
        : [{ emit: 'event', level: 'error' }],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

prisma.$on('error', (event) => {
  logger.error({ message: event.message }, 'Prisma client error');
});
