import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.DEMO_SEED_ENABLED !== 'true') {
    console.info('ContinuityGrid demo seed skipped. Set DEMO_SEED_ENABLED=true to create fictional demo records.');
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed is disabled in production environments.');
  }
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!password || password.length < 16) {
    throw new Error('DEMO_ADMIN_PASSWORD must be provided and contain at least 16 characters.');
  }
  const email = (process.env.DEMO_ADMIN_EMAIL || 'admin@continuitygrid.local').trim().toLowerCase();
  const slug = (process.env.DEMO_ORGANIZATION_SLUG || 'continuitygrid-demo').trim().toLowerCase();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const organization = await prisma.organization.upsert({
    where: { slug },
    update: { name: 'Northstar Financial Group — Demo' },
    create: { slug, name: 'Northstar Financial Group — Demo' },
  });
  const user = await prisma.user.upsert({
    where: { email },
    update: { displayName: 'Demo Workspace Administrator' },
    create: { email, displayName: 'Demo Workspace Administrator', passwordHash },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: { status: 'ACTIVE', role: 'OWNER', joinedAt: new Date() },
    create: { userId: user.id, organizationId: organization.id, status: 'ACTIVE', role: 'OWNER', joinedAt: new Date() },
  });

  const services = [
    { name: 'Digital Payments', ownerName: 'Payments Operations', criticality: 'CRITICAL' as const },
    { name: 'Customer Identity', ownerName: 'Identity Engineering', criticality: 'HIGH' as const },
    { name: 'Treasury Operations', ownerName: 'Finance Technology', criticality: 'CRITICAL' as const },
    { name: 'Customer Support', ownerName: 'Customer Experience', criticality: 'MEDIUM' as const },
    { name: 'Regulatory Reporting', ownerName: 'Risk & Compliance', criticality: 'HIGH' as const },
  ];
  const serviceRows = [];
  for (const item of services) {
    serviceRows.push(await prisma.businessService.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: item.name } },
      update: { ownerName: item.ownerName, criticality: item.criticality, status: 'ACTIVE' },
      create: { organizationId: organization.id, ...item, status: 'ACTIVE' },
    }));
  }
  const processes = ['Payment settlement', 'Customer authentication', 'Liquidity management', 'Customer case handling'];
  for (const name of processes) {
    await prisma.businessProcess.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: {},
      create: { organizationId: organization.id, name, ownerName: 'Demo Process Office' },
    });
  }
  const apps = [
    { name: 'Northstar PayCore', vendor: 'Northstar Digital' },
    { name: 'Identity Gateway', vendor: 'Northstar Digital' },
    { name: 'Treasury Ledger', vendor: 'Fictional Systems Ltd' },
    { name: 'Service Desk', vendor: 'Fictional Systems Ltd' },
  ];
  const appRows = [];
  for (const item of apps) {
    appRows.push(await prisma.application.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: item.name } },
      update: { vendor: item.vendor },
      create: { organizationId: organization.id, ...item },
    }));
  }
  const assets = [
    { name: 'Primary PostgreSQL Cluster', assetType: 'DATABASE', environment: 'PRODUCTION' },
    { name: 'Payments Kubernetes Cluster', assetType: 'COMPUTE', environment: 'PRODUCTION' },
    { name: 'Identity Edge Gateway', assetType: 'NETWORK', environment: 'PRODUCTION' },
  ];
  for (const item of assets) {
    await prisma.technologyAsset.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: item.name } },
      update: { assetType: item.assetType, environment: item.environment },
      create: { organizationId: organization.id, ...item },
    });
  }
  const suppliers = [
    { name: 'CloudNorth Hosting', criticality: 'CRITICAL' as const, website: 'https://example.com' },
    { name: 'SecureRoute Network Services', criticality: 'HIGH' as const, website: 'https://example.org' },
    { name: 'Fictional Data Exchange', criticality: 'MEDIUM' as const, website: 'https://example.net' },
  ];
  for (const item of suppliers) {
    await prisma.supplier.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: item.name } },
      update: { criticality: item.criticality, website: item.website },
      create: { organizationId: organization.id, ...item },
    });
  }

  const links = [
    { sourceId: serviceRows[0]!.id, targetId: appRows[0]!.id, type: 'DEPENDS_ON' as const },
    { sourceId: serviceRows[1]!.id, targetId: appRows[1]!.id, type: 'DEPENDS_ON' as const },
    { sourceId: serviceRows[2]!.id, targetId: appRows[2]!.id, type: 'DEPENDS_ON' as const },
  ];
  for (const link of links) {
    const exists = await prisma.dependency.findFirst({
      where: { organizationId: organization.id, sourceType: 'BUSINESS_SERVICE', sourceId: link.sourceId, targetType: 'APPLICATION', targetId: link.targetId, type: link.type },
    });
    if (!exists) {
      await prisma.dependency.create({
        data: { organizationId: organization.id, sourceType: 'BUSINESS_SERVICE', sourceId: link.sourceId, targetType: 'APPLICATION', targetId: link.targetId, type: link.type, status: 'VERIFIED', criticality: 'HIGH', confidence: 95, verifiedAt: new Date() },
      });
    }
  }
  const activityCount = await prisma.auditEvent.count({ where: { organizationId: organization.id } });
  if (activityCount === 0) {
    await prisma.auditEvent.create({
      data: { organizationId: organization.id, actorUserId: user.id, action: 'demo.workspace_seeded', targetType: 'organization', targetId: organization.id, metadata: { fictional: true, source: 'opt_in_demo_seed' } },
    });
  }
  console.info(`Fictional ContinuityGrid demo tenant ready: ${slug} (${email}). The password was supplied through DEMO_ADMIN_PASSWORD.`);
}

main()
  .catch((error: unknown) => {
    console.error('Database seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
