import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

type Tenant = { organizationId: string; organizationSlug: string; userId: string; email: string; token: string };

async function registerTenant(label: string, suffix: string): Promise<Tenant> {
  const email = `supplier-auth-${label}-${suffix}@example.test`;
  const password = 'Authorization-test-password-2026!';
  const response = await request(app).post('/api/v1/auth/register').send({
    email, password, displayName: `Supplier ${label}`,
    organizationName: `Supplier Authorization ${label} ${suffix}`,
    organizationSlug: `supplier-auth-${label}-${suffix}`,
  });
  expect(response.status).toBe(201);
  return {
    organizationId: response.body.data.organization.id,
    organizationSlug: response.body.data.organization.slug,
    userId: response.body.data.user.id,
    token: response.body.data.accessToken,
  };
}

async function addTenantRole(user: Tenant, organizationId: string, role: 'ADMIN' | 'RESILIENCE_MANAGER' | 'ANALYST' | 'VIEWER') {
  await prisma.membership.create({
    data: { userId: user.userId, organizationId, role, status: 'ACTIVE', joinedAt: new Date() },
  });
  const login = await request(app).post('/api/v1/auth/login').send({
    email: user.email,
    password: 'Authorization-test-password-2026!',
    organizationSlug: (await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { slug: true } })).slug,
  });
  expect(login.status).toBe(200);
  return login.body.data.accessToken as string;
}

describe('supplier role authorization and tenant boundaries', () => {
  it('enforces the role matrix, cross-tenant isolation and maker-checker approval', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const tenants: Tenant[] = [];
    let foreignServiceId: string | undefined;
    let supplierId: string | undefined;
    let assessmentId: string | undefined;
    const extraSupplierIds: string[] = [];

    try {
      const owner = await registerTenant('owner', suffix); tenants.push(owner);
      const foreign = await registerTenant('foreign', suffix); tenants.push(foreign);
      const admin = await registerTenant('admin', suffix); tenants.push(admin);
      const manager = await registerTenant('manager', suffix); tenants.push(manager);
      const analyst = await registerTenant('analyst', suffix); tenants.push(analyst);
      const viewer = await registerTenant('viewer', suffix); tenants.push(viewer);

      const [adminToken, managerToken, analystToken, viewerToken] = await Promise.all([
        addTenantRole(admin, owner.organizationId, 'ADMIN'),
        addTenantRole(manager, owner.organizationId, 'RESILIENCE_MANAGER'),
        addTenantRole(analyst, owner.organizationId, 'ANALYST'),
        addTenantRole(viewer, owner.organizationId, 'VIEWER'),
      ]);

      const supplier = await request(app).post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: `Tenant A Supplier ${suffix}`, criticality: 'HIGH' });
      expect(supplier.status).toBe(201);
      supplierId = supplier.body.data.id;

      const foreignService = await prisma.businessService.create({
        data: { organizationId: foreign.organizationId, name: `Foreign Service ${suffix}` },
      });
      foreignServiceId = foreignService.id;

      const contractPayload = { contractReference: `FOREIGN-SERVICE-${suffix}`, ownerName: 'Test owner', serviceIds: [foreignServiceId] };
      const crossTenantServiceLink = await request(app).post(`/api/v1/suppliers/${supplierId}/contracts`)
        .set('Authorization', `Bearer ${owner.token}`).send(contractPayload);
      expect(crossTenantServiceLink.status).toBe(404);
      expect(crossTenantServiceLink.body.error.code).toBe('SUPPLIER_SERVICE_NOT_FOUND');

      const crossTenantContract = await request(app).post(`/api/v1/suppliers/${supplierId}/contracts`)
        .set('Authorization', `Bearer ${foreign.token}`)
        .send({ contractReference: `FOREIGN-${suffix}`, ownerName: 'Foreign owner' });
      expect(crossTenantContract.status).toBe(404);
      expect(crossTenantContract.body.error.code).toBe('SUPPLIER_NOT_FOUND');

      const crossTenantAssessment = await request(app).post(`/api/v1/suppliers/${supplierId}/assessments`)
        .set('Authorization', `Bearer ${foreign.token}`)
        .send({ ownerName: 'Foreign owner', resilienceScore: 3, securityScore: 3, concentrationScore: 3, rationale: 'Attempt to access another tenant supplier.' });
      expect(crossTenantAssessment.status).toBe(404);

      const draft = await request(app).post(`/api/v1/suppliers/${supplierId}/assessments`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ ownerName: 'Tenant A owner', resilienceScore: 2, securityScore: 3, concentrationScore: 4, rationale: 'Documented assessment for maker-checker authorization.' });
      expect(draft.status).toBe(201);
      assessmentId = draft.body.data.id;

      const evidence = await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/evidence`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Independent review', evidenceType: 'AUDIT_REPORT', reference: 'https://evidence.example.test/report.pdf' });
      expect(evidence.status).toBe(201);

      const submitted = await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/submit`)
        .set('Authorization', `Bearer ${owner.token}`).send({});
      expect(submitted.status).toBe(200);

      const makerCannotApprove = await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/approve`)
        .set('Authorization', `Bearer ${owner.token}`).send({ rationale: 'I created this assessment.' });
      expect(makerCannotApprove.status).toBe(409);
      expect(makerCannotApprove.body.error.code).toBe('SUPPLIER_ASSESSMENT_MAKER_CHECKER');

      const foreignSubmit = await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/submit`)
        .set('Authorization', `Bearer ${foreign.token}`).send({});
      expect(foreignSubmit.status).toBe(409);
      const foreignApprove = await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/approve`)
        .set('Authorization', `Bearer ${foreign.token}`).send({ rationale: 'Foreign tenant attempt.' });
      expect(foreignApprove.status).toBe(404);
      const foreignEvidence = await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/evidence`)
        .set('Authorization', `Bearer ${foreign.token}`)
        .send({ title: 'Foreign evidence', evidenceType: 'OTHER', reference: 'https://foreign.example.test/evidence' });
      expect(foreignEvidence.status).toBe(404);

      const approved = await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`).send({ rationale: 'Independent administrative review completed.' });
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('APPROVED');
      expect(approved.body.data.approvedByUserId).toBe(admin.userId);

      for (const [role, token] of [['ADMIN', adminToken], ['RESILIENCE_MANAGER', managerToken]] as const) {
        const created = await request(app).post('/api/v1/suppliers')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: `${role} Supplier ${suffix}` });
        expect(created.status).toBe(201);
        extraSupplierIds.push(created.body.data.id);
      }

      for (const [role, token] of [['ANALYST', analystToken], ['VIEWER', viewerToken]] as const) {
        expect((await request(app).get('/api/v1/suppliers').set('Authorization', `Bearer ${token}`)).status).toBe(200);
        expect((await request(app).get('/api/v1/suppliers/summary').set('Authorization', `Bearer ${token}`)).status).toBe(200);
        expect((await request(app).post('/api/v1/suppliers').set('Authorization', `Bearer ${token}`).send({ name: `${role} forbidden ${suffix}` })).status).toBe(403);
        expect((await request(app).post(`/api/v1/suppliers/${supplierId}/contracts`).set('Authorization', `Bearer ${token}`).send({ contractReference: `${role}-FORBIDDEN-${suffix}`, ownerName: 'Forbidden' })).status).toBe(403);
        expect((await request(app).post(`/api/v1/suppliers/${supplierId}/assessments`).set('Authorization', `Bearer ${token}`).send({ ownerName: 'Forbidden', resilienceScore: 1, securityScore: 1, concentrationScore: 1, rationale: 'Forbidden role mutation attempt.' })).status).toBe(403);
        expect((await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/evidence`).set('Authorization', `Bearer ${token}`).send({ title: 'Forbidden', evidenceType: 'OTHER', reference: 'https://forbidden.example.test' })).status).toBe(403);
        expect((await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${token}`).send({})).status).toBe(403);
        expect((await request(app).post(`/api/v1/suppliers/assessments/${assessmentId}/approve`).set('Authorization', `Bearer ${token}`).send({ rationale: 'Forbidden role approval attempt.' })).status).toBe(403);
      }
    } finally {
      const organizationIds = tenants.map(tenant => tenant.organizationId);
      await prisma.supplierEvidence.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.supplierAssessment.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.supplierContractService.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.supplierContract.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.supplier.deleteMany({ where: { organizationId: { in: organizationIds } } });
      if (foreignServiceId) await prisma.businessService.deleteMany({ where: { id: foreignServiceId } });
      await prisma.auditEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
      const userIds = tenants.map(tenant => tenant.userId);
      await prisma.refreshSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }, 30000);
});

afterAll(async () => { await prisma.$disconnect(); });
