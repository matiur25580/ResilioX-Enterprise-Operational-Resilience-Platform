import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('third-party resilience API', () => {
  it('protects supplier registers, summaries, contracts and assurance workflows behind authentication', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect((await request(app).get('/api/v1/suppliers')).status).toBe(401);
    expect((await request(app).get('/api/v1/suppliers/summary')).status).toBe(401);
    expect((await request(app).post('/api/v1/suppliers').send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/suppliers/${id}/contracts`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/suppliers/${id}/assessments`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/suppliers/assessments/${id}/submit`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/suppliers/assessments/${id}/approve`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/suppliers/assessments/${id}/evidence`).send({})).status).toBe(401);
  });
});

afterAll(async () => { await prisma.$disconnect(); });
