import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('command center API', () => {
  it('requires an authenticated tenant session for overview data', async () => {
    const response = await request(app).get('/api/v1/command-center/overview');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
