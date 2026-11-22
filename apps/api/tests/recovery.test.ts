import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('recovery orchestration API', () => {
  const id = '00000000-0000-4000-8000-000000000001';

  it('protects runbook and simulation reads and mutations behind authentication', async () => {
    expect((await request(app).get('/api/v1/recovery/runbooks')).status).toBe(401);
    expect((await request(app).get(`/api/v1/recovery/runbooks/${id}`)).status).toBe(401);
    expect((await request(app).post('/api/v1/recovery/runbooks').send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/recovery/runbooks/${id}/submit`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/recovery/runbooks/${id}/approve`).send({})).status).toBe(401);
    expect((await request(app).get('/api/v1/recovery/simulations')).status).toBe(401);
    expect((await request(app).get(`/api/v1/recovery/simulations/${id}`)).status).toBe(401);
    expect((await request(app).post('/api/v1/recovery/simulations').send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/recovery/simulations/${id}/start`).send({})).status).toBe(401);
    expect((await request(app).patch(`/api/v1/recovery/simulations/${id}/steps/${id}`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/recovery/simulations/${id}/complete`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/recovery/simulations/${id}/cancel`).send({})).status).toBe(401);
  });
});

afterAll(async () => { await prisma.$disconnect(); });
