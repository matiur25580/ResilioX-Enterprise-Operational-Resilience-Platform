import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('business impact analysis API', () => {
  it('requires an authenticated tenant session for assessment records', async () => {
    const response = await request(app).get('/api/v1/bia');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });
  it('requires authentication before exposing process choices', async () => {
    const response = await request(app).get('/api/v1/bia/processes');
    expect(response.status).toBe(401);
  });
  it('requires authentication before creating an assessment', async () => {
    const response = await request(app).post('/api/v1/bia').send({});
    expect(response.status).toBe(401);
  });
});

afterAll(async () => { await prisma.$disconnect(); });
