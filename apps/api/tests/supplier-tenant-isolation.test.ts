import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('supplier tenant isolation integration', () => {
  it('isolates supplier registers and rejects cross-tenant contract access', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
    const tenants: Array<{ organizationId: string; userId: string; token: string }> = [];
    let supplierId: string | undefined;

    try {
      for (const label of ['alpha', 'bravo']) {
        const response = await request(app).post('/api/v1/auth/register').send({
          email: `supplier-${label}-${suffix}@example.test`,
          password: 'Integration-test-password-2026!',
          displayName: `Supplier ${label}`,
          organizationName: `Supplier Isolation ${label} ${suffix}`,
          organizationSlug: `supplier-isolation-${label}-${suffix}`,
        });
        expect(response.status).toBe(201);
        expect(response.body.data.accessToken).toBeTruthy();
        tenants.push({
          organizationId: response.body.data.organization.id,
          userId: response.body.data.user.id,
          token: response.body.data.accessToken,
        });
      }

      const [alpha, bravo] = tenants;
      if (!alpha || !bravo) throw new Error('Test tenants were not provisioned.');

      const created = await request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${alpha.token}`)
        .send({ name: `Alpha Critical Supplier ${suffix}`, criticality: 'CRITICAL' });
      expect(created.status).toBe(201);
      supplierId = created.body.data.id;

      const alphaRegister = await request(app)
        .get('/api/v1/suppliers')
        .set('Authorization', `Bearer ${alpha.token}`);
      expect(alphaRegister.status).toBe(200);
      expect(alphaRegister.body.data.map((supplier: { id: string }) => supplier.id)).toContain(supplierId);

      const bravoRegister = await request(app)
        .get('/api/v1/suppliers')
        .set('Authorization', `Bearer ${bravo.token}`);
      expect(bravoRegister.status).toBe(200);
      expect(bravoRegister.body.data).toEqual([]);

      const crossTenantContract = await request(app)
        .post(`/api/v1/suppliers/${supplierId}/contracts`)
        .set('Authorization', `Bearer ${bravo.token}`)
        .send({ contractReference: 'FOREIGN-REF', ownerName: 'Bravo reviewer', status: 'DRAFT' });
      expect(crossTenantContract.status).toBe(404);
      expect(crossTenantContract.body.error.code).toBe('SUPPLIER_NOT_FOUND');

      const bravoSummary = await request(app)
        .get('/api/v1/suppliers/summary')
        .set('Authorization', `Bearer ${bravo.token}`);
      expect(bravoSummary.status).toBe(200);
      expect(bravoSummary.body.data.supplierCount).toBe(0);
      expect(bravoSummary.body.data.verifiedSupplierDependencyCount).toBe(0);
    } finally {
      if (supplierId) await prisma.supplier.deleteMany({ where: { id: supplierId } });
      for (const tenant of tenants) {
        await prisma.refreshSession.deleteMany({ where: { userId: tenant.userId } });
        await prisma.$transaction(async tx => {
          await tx.$queryRawUnsafe("SELECT set_config('app.audit_maintenance', 'on', true)");
          await tx.auditEvent.deleteMany({ where: { organizationId: tenant.organizationId } });
        });
        await prisma.membership.deleteMany({ where: { organizationId: tenant.organizationId } });
        await prisma.organization.deleteMany({ where: { id: tenant.organizationId } });
        await prisma.user.deleteMany({ where: { id: tenant.userId } });
      }
    }
  });
});

afterAll(async () => { await prisma.$disconnect(); });
