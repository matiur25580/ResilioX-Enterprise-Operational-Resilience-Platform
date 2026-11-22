import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const commandCenterRouter = Router();

commandCenterRouter.get('/overview', requireAuth, async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const [serviceCount, activeServiceCount, criticalServiceCount, servicesByCriticality, processCount, applicationCount, assetCount, supplierCount, dependencyCount, verifiedDependencyCount, dependencyReviewCount, services, recentActivity] = await Promise.all([
    prisma.businessService.count({ where: { organizationId } }),
    prisma.businessService.count({ where: { organizationId, status: 'ACTIVE' } }),
    prisma.businessService.count({ where: { organizationId, criticality: 'CRITICAL', status: { not: 'RETIRED' } } }),
    prisma.businessService.groupBy({ by: ['criticality'], where: { organizationId }, _count: { _all: true } }),
    prisma.businessProcess.count({ where: { organizationId } }),
    prisma.application.count({ where: { organizationId } }),
    prisma.technologyAsset.count({ where: { organizationId } }),
    prisma.supplier.count({ where: { organizationId } }),
    prisma.dependency.count({ where: { organizationId, status: { not: 'RETIRED' } } }),
    prisma.dependency.count({ where: { organizationId, status: 'VERIFIED' } }),
    prisma.dependency.count({ where: { organizationId, status: { in: ['PROPOSED', 'DISPUTED'] } } }),
    prisma.businessService.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { id: true, name: true, ownerName: true, criticality: true, status: true, updatedAt: true },
    }),
    prisma.auditEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true, actor: { select: { displayName: true } } },
    }),
  ]);

  res.json({
    data: {
      generatedAt: new Date().toISOString(),
      source: 'tenant_database',
      metrics: {
        services: serviceCount,
        activeServices: activeServiceCount,
        criticalServices: criticalServiceCount,
        processes: processCount,
        applications: applicationCount,
        technologyAssets: assetCount,
        suppliers: supplierCount,
        dependencies: dependencyCount,
        verifiedDependencies: verifiedDependencyCount,
        dependenciesNeedingReview: dependencyReviewCount,
      },
      serviceCriticality: servicesByCriticality.map(item => ({ tier: item.criticality, count: item._count._all })),
      services,
      recentActivity: recentActivity.map(item => ({
        id: item.id,
        action: item.action,
        targetType: item.targetType,
        targetId: item.targetId,
        actorName: item.actor?.displayName ?? 'System',
        occurredAt: item.createdAt,
      })),
      capabilities: {
        businessImpactAnalysis: 'available',
        dependencyIntelligence: 'available',
        riskAndControls: 'available',
        continuityPlans: 'planned',
        incidentManagement: 'planned',
        disasterRecovery: 'planned',
        scenarioSimulation: 'planned',
      },
    },
  });
});
