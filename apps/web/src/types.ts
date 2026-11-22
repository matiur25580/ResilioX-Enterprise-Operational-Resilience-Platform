export interface User {
  id: string;
  email: string;
  displayName: string;
}
export interface Tenant {
  id: string;
  membershipId: string;
  role: string;
}
export interface Overview {
  generatedAt: string;
  source: 'tenant_database';
  metrics: {
    services: number;
    activeServices: number;
    criticalServices: number;
    processes: number;
    applications: number;
    technologyAssets: number;
    suppliers: number;
    dependencies: number;
    verifiedDependencies: number;
    dependenciesNeedingReview: number;
  };
  serviceCriticality: { tier: string; count: number }[];
  services: {
    id: string;
    name: string;
    ownerName: string | null;
    criticality: string;
    status: string;
    updatedAt: string;
  }[];
  recentActivity: {
    id: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    actorName: string;
    occurredAt: string;
  }[];
  capabilities: Record<string, 'planned'>;
}
