import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

async function register(label: string, suffix: string) {
  const email = `governance-${label}-${suffix}@example.test`, password = 'Governance-test-password-2026!';
  const response = await request(app).post('/api/v1/auth/register').send({
    email, password, displayName: `Governance ${label}`,
    organizationName: `Governance ${label} ${suffix}`, organizationSlug: `governance-${label}-${suffix}`,
  });
  expect(response.status).toBe(201);
  return { email, password, userId: response.body.data.user.id as string, organizationId: response.body.data.organization.id as string, slug: response.body.data.organization.slug as string, token: response.body.data.accessToken as string };
}

async function addRole(user: Awaited<ReturnType<typeof register>>, organizationId: string, role: 'ADMIN' | 'ANALYST' | 'VIEWER') {
  await prisma.membership.create({ data: { userId: user.userId, organizationId, role, status: 'ACTIVE', joinedAt: new Date() } });
  const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password, organizationSlug: (await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { slug: true } })).slug });
  expect(login.status).toBe(200);
  return login.body.data.accessToken as string;
}

describe('governance evidence, policy and audit authorization', () => {
  it('enforces tenant boundaries, maker-checker and append-only audit reads', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const owner = await register('owner', suffix), reviewer = await register('reviewer', suffix), analyst = await register('analyst', suffix), viewer = await register('viewer', suffix), foreign = await register('foreign', suffix);
    let evidenceId: string | undefined, policyId: string | undefined;
    try {
      const [reviewerToken, analystToken, viewerToken] = await Promise.all([
        addRole(reviewer, owner.organizationId, 'ADMIN'),
        addRole(analyst, owner.organizationId, 'ANALYST'),
        addRole(viewer, owner.organizationId, 'VIEWER'),
      ]);
      expect((await request(app).get('/api/v1/governance/audit/events')).status).toBe(401);
      const evidence = await request(app).post('/api/v1/governance/evidence').set('Authorization', `Bearer ${owner.token}`).send({
        title: 'Independent security audit', evidenceType: 'AUDIT_REPORT', referenceUri: 'https://evidence.example.test/audit.pdf',
        description: 'Annual independent assurance report for the payment service.', targetType: 'BUSINESS_SERVICE', targetId: randomUUID(),
        checksumSha256: 'a'.repeat(64),
      });
      expect(evidence.status).toBe(201); evidenceId = evidence.body.data.id;
      expect((await request(app).post(`/api/v1/governance/evidence/${evidenceId}/submit`).set('Authorization', `Bearer ${owner.token}`).send({})).status).toBe(200);
      const makerReview = await request(app).post(`/api/v1/governance/evidence/${evidenceId}/review`).set('Authorization', `Bearer ${owner.token}`).send({ decision: 'VERIFIED', rationale: 'I created this evidence record.' });
      expect(makerReview.status).toBe(403);
      const verified = await request(app).post(`/api/v1/governance/evidence/${evidenceId}/review`).set('Authorization', `Bearer ${reviewerToken}`).send({ decision: 'VERIFIED', rationale: 'Reference checked and checksum recorded.' });
      expect(verified.status).toBe(200); expect(verified.body.data.status).toBe('VERIFIED');

      const policy = await request(app).post('/api/v1/governance/policies').set('Authorization', `Bearer ${owner.token}`).send({
        name: 'Access control assurance', framework: 'ISO 22301', controlReference: '8.4.2',
        description: 'Defines the access control assurance requirement for resilience records.',
      });
      expect(policy.status).toBe(201); policyId = policy.body.data.id;
      expect((await request(app).post(`/api/v1/governance/policies/${policyId}/submit`).set('Authorization', `Bearer ${owner.token}`).send({})).status).toBe(200);
      const makerApproval = await request(app).post(`/api/v1/governance/policies/${policyId}/approve`).set('Authorization', `Bearer ${owner.token}`).send({ rationale: 'Self approval attempt.' });
      expect(makerApproval.status).toBe(403);
      expect((await request(app).post(`/api/v1/governance/policies/${policyId}/approve`).set('Authorization', `Bearer ${reviewerToken}`).send({ rationale: 'Independent policy review completed.' })).status).toBe(200);
      expect((await request(app).post(`/api/v1/governance/policies/${policyId}/evidence`).set('Authorization', `Bearer ${owner.token}`).send({ evidenceId })).status).toBe(201);

      const audit = await request(app).get('/api/v1/governance/audit/events?limit=10').set('Authorization', `Bearer ${analystToken}`);
      expect(audit.status).toBe(200);
      expect(audit.body.data.some((event: { action: string }) => event.action === 'governance.evidence.reviewed')).toBe(true);
      expect(audit.body.data.some((event: { action: string }) => event.action === 'governance.policy.approved')).toBe(true);
      const reviewedEventId = audit.body.data.find((event: { action: string }) => event.action === 'governance.evidence.reviewed').id as string;
      await expect(prisma.auditEvent.update({ where: { id: reviewedEventId }, data: { action: 'tampered.audit.event' } })).rejects.toThrow(/append-only/);
      await expect(prisma.auditEvent.delete({ where: { id: reviewedEventId } })).rejects.toThrow(/append-only/);

      expect((await request(app).get('/api/v1/governance/audit/events').set('Authorization', `Bearer ${viewerToken}`)).status).toBe(403);
      expect((await request(app).get('/api/v1/governance/evidence').set('Authorization', `Bearer ${foreign.token}`)).body.data).toHaveLength(0);
      expect((await request(app).get('/api/v1/governance/audit/events').set('Authorization', `Bearer ${foreign.token}`)).body.data).toHaveLength(0);
    } finally {
      const organizationIds = [owner.organizationId, reviewer.organizationId, analyst.organizationId, viewer.organizationId, foreign.organizationId];
      await prisma.policyEvidenceLink.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.governancePolicy.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.governanceEvidence.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe("SELECT set_config('app.audit_maintenance', 'on', true)");
        await tx.auditEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
      });
      const userIds = [owner.userId, reviewer.userId, analyst.userId, viewer.userId, foreign.userId];
      await prisma.refreshSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }, 30000);
});
