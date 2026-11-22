import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('dependency intelligence API', () => {
  it('requires authentication for the dependency register', async () => {
    const response = await request(app).get('/api/v1/dependencies');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });
  it('requires authentication for tenant node catalogs', async () => {
    const response = await request(app).get('/api/v1/dependencies/nodes');
    expect(response.status).toBe(401);
  });
  it('requires authentication for graph traversal', async () => {
    const response = await request(app).get('/api/v1/dependencies/graph?nodeType=APPLICATION&nodeId=11111111-1111-4111-8111-111111111111');
    expect(response.status).toBe(401);
  });
  it('requires authentication before proposing a relationship', async () => {
    const response = await request(app).post('/api/v1/dependencies').send({});
    expect(response.status).toBe(401);
  });
});

afterAll(async () => { await prisma.$disconnect(); });
