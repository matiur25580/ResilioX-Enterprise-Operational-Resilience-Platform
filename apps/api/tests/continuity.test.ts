import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('business continuity API', () => {
 it('requires authentication for plan and summary reads', async () => {
  expect((await request(app).get('/api/v1/continuity')).status).toBe(401);
  expect((await request(app).get('/api/v1/continuity/summary')).status).toBe(401);
  expect((await request(app).get('/api/v1/continuity/services')).status).toBe(401);
 });
 it('requires authentication for plan and exercise mutations', async () => {
  expect((await request(app).post('/api/v1/continuity').send({})).status).toBe(401);
  expect((await request(app).post('/api/v1/continuity/00000000-0000-4000-8000-000000000001/submit').send({})).status).toBe(401);
  expect((await request(app).post('/api/v1/continuity/00000000-0000-4000-8000-000000000001/exercises').send({})).status).toBe(401);
  expect((await request(app).patch('/api/v1/continuity/exercises/00000000-0000-4000-8000-000000000001/status').send({})).status).toBe(401);
 });
 it('requires authentication for incident register and mutations', async () => {
  expect((await request(app).get('/api/v1/incidents')).status).toBe(401);
  expect((await request(app).get('/api/v1/incidents/summary')).status).toBe(401);
  expect((await request(app).post('/api/v1/incidents').send({})).status).toBe(401);
  expect((await request(app).patch('/api/v1/incidents/00000000-0000-4000-8000-000000000001/status').send({})).status).toBe(401);
  expect((await request(app).post('/api/v1/incidents/00000000-0000-4000-8000-000000000001/tasks').send({})).status).toBe(401);
 });
});
afterAll(async()=>{await prisma.$disconnect();});
