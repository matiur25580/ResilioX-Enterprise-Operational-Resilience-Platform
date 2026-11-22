import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('risk and controls API', () => {
  it('requires authentication for risk register and summary', async () => {
    expect((await request(app).get('/api/v1/risks')).status).toBe(401);
    expect((await request(app).get('/api/v1/risks/summary')).status).toBe(401);
  });
  it('requires authentication for control catalog and mutations', async () => {
    expect((await request(app).get('/api/v1/risks/controls')).status).toBe(401);
    expect((await request(app).post('/api/v1/risks/controls').send({})).status).toBe(401);
    expect((await request(app).post('/api/v1/risks').send({})).status).toBe(401);
  });
  it('requires authentication before risk lifecycle and treatment updates', async () => {
    expect((await request(app).patch('/api/v1/risks/00000000-0000-4000-8000-000000000001/status').send({ status: 'CLOSED' })).status).toBe(401);
  });
});

afterAll(async () => { await prisma.$disconnect(); });
