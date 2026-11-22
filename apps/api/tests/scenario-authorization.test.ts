import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

async function register(label: string, suffix: string) {
  const email = `scenario-${label}-${suffix}@example.test`;
  const password = 'Scenario-test-password-2026!';
  const response = await request(app).post('/api/v1/auth/register').send({
    email, password, displayName: `Scenario ${label}`,
    organizationName: `Scenario ${label} ${suffix}`, organizationSlug: `scenario-${label}-${suffix}`,
  });
  expect(response.status).toBe(201);
  return { email, password, userId: response.body.data.user.id as string, organizationId: response.body.data.organization.id as string, slug: response.body.data.organization.slug as string, token: response.body.data.accessToken as string };
}

describe('scenario simulation authorization and tenant boundaries', () => {
  it('keeps run history tenant-scoped and requires continuity:write to create runs', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const owner = await register('owner', suffix);
    const foreign = await register('foreign', suffix);
    const analyst = await register('analyst', suffix);
    let serviceId: string | undefined;
    try {
      await prisma.membership.create({ data: { userId: analyst.userId, organizationId: owner.organizationId, role: 'ANALYST', status: 'ACTIVE', joinedAt: new Date() } });
      const analystLogin = await request(app).post('/api/v1/auth/login').send({ email: analyst.email, password: analyst.password, organizationSlug: owner.slug });
      expect(analystLogin.status).toBe(200);
      const analystToken = analystLogin.body.data.accessToken as string;
      const service = await prisma.businessService.create({ data: { organizationId: owner.organizationId, name: `Scenario service ${suffix}`, criticality: 'CRITICAL', status: 'ACTIVE' } });
      serviceId = service.id;
      const foreignService = await prisma.businessService.create({ data: { organizationId: foreign.organizationId, name: `Foreign scenario service ${suffix}` } });

      expect((await request(app).get('/api/v1/scenarios/templates')).status).toBe(401);
      expect((await request(app).get('/api/v1/scenarios/templates').set('Authorization', `Bearer ${owner.token}`)).status).toBe(200);
      expect((await request(app).post('/api/v1/scenarios/runs').set('Authorization', `Bearer ${analystToken}`).send({
        templateId: 'service-outage', rootType: 'BUSINESS_SERVICE', rootId: serviceId, severity: 'UNAVAILABLE', durationHours: 8,
      })).status).toBe(403);
      const crossTenant = await request(app).post('/api/v1/scenarios/runs').set('Authorization', `Bearer ${owner.token}`).send({
        templateId: 'service-outage', rootType: 'BUSINESS_SERVICE', rootId: foreignService.id, severity: 'UNAVAILABLE', durationHours: 8,
      });
      expect(crossTenant.status).toBe(404);
      const created = await request(app).post('/api/v1/scenarios/runs').set('Authorization', `Bearer ${owner.token}`).send({
        templateId: 'service-outage', rootType: 'BUSINESS_SERVICE', rootId: serviceId, severity: 'UNAVAILABLE', durationHours: 8,
      });
      expect(created.status).toBe(201);
      expect(created.body.data.result.affectedServices[0].id).toBe(serviceId);
      expect((await request(app).get('/api/v1/scenarios/runs').set('Authorization', `Bearer ${owner.token}`)).body.data).toHaveLength(1);
      expect((await request(app).get('/api/v1/scenarios/runs').set('Authorization', `Bearer ${foreign.token}`)).body.data).toHaveLength(0);
    } finally {
      const organizationIds = [owner.organizationId, foreign.organizationId, analyst.organizationId];
      await prisma.$transaction(async tx => {
          await tx.$executeRawUnsafe("SELECT set_config('app.audit_maintenance', 'on', true)");
          await tx.auditEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
        });
      await prisma.businessService.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [owner.userId, foreign.userId, analyst.userId] } } });
      await prisma.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.userId, foreign.userId, analyst.userId] } } });
    }
  });
});
