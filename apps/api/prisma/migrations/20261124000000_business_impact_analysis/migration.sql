-- Milestone 05: tenant-scoped business impact assessments and time-horizon impact snapshots.
CREATE TYPE "BiaStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'RETIRED');
CREATE TYPE "ImpactHorizon" AS ENUM ('IMMEDIATE', 'FOUR_HOURS', 'TWENTY_FOUR_HOURS', 'SEVENTY_TWO_HOURS', 'ONE_WEEK');

CREATE TABLE "business_impact_assessments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "process_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "BiaStatus" NOT NULL DEFAULT 'DRAFT',
  "owner_name" VARCHAR(120) NOT NULL,
  "mtpd_minutes" INTEGER NOT NULL,
  "rto_minutes" INTEGER NOT NULL,
  "rpo_minutes" INTEGER NOT NULL,
  "rationale" TEXT NOT NULL,
  "criticality" "CriticalityTier" NOT NULL DEFAULT 'MEDIUM',
  "impact_score" INTEGER NOT NULL,
  "review_due_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "approved_by" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_impact_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_impact_assessments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "business_impact_assessments_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "business_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bia_objectives_positive_check" CHECK ("mtpd_minutes" > 0 AND "rto_minutes" > 0 AND "rpo_minutes" >= 0 AND "rto_minutes" <= "mtpd_minutes"),
  CONSTRAINT "bia_impact_score_range_check" CHECK ("impact_score" BETWEEN 4 AND 20)
);
CREATE UNIQUE INDEX "business_impact_assessments_org_process_version_key" ON "business_impact_assessments"("organization_id", "process_id", "version");
CREATE INDEX "business_impact_assessments_org_status_updated_idx" ON "business_impact_assessments"("organization_id", "status", "updated_at");
CREATE INDEX "business_impact_assessments_org_criticality_idx" ON "business_impact_assessments"("organization_id", "criticality");

CREATE TABLE "bia_impact_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assessment_id" UUID NOT NULL,
  "horizon" "ImpactHorizon" NOT NULL,
  "financial" INTEGER NOT NULL,
  "operational" INTEGER NOT NULL,
  "regulatory" INTEGER NOT NULL,
  "reputational" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bia_impact_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bia_impact_snapshots_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "business_impact_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bia_impact_scores_range_check" CHECK ("financial" BETWEEN 1 AND 5 AND "operational" BETWEEN 1 AND 5 AND "regulatory" BETWEEN 1 AND 5 AND "reputational" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "bia_impact_snapshots_assessment_horizon_key" ON "bia_impact_snapshots"("assessment_id", "horizon");
