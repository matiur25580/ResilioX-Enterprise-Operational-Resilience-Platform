CREATE TYPE "RiskStatus" AS ENUM ('IDENTIFIED', 'ASSESSED', 'TREATING', 'ACCEPTED', 'CLOSED');
CREATE TYPE "ControlStatus" AS ENUM ('DESIGN', 'IMPLEMENTED', 'TESTED', 'NEEDS_REMEDIATION');
CREATE TYPE "RiskTreatmentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED');
CREATE TYPE "RiskTargetType" AS ENUM ('BUSINESS_SERVICE', 'BUSINESS_PROCESS', 'APPLICATION', 'TECHNOLOGY_ASSET', 'SUPPLIER', 'DEPENDENCY');

CREATE TABLE "risks" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "description" TEXT NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "owner_name" VARCHAR(120) NOT NULL,
  "target_type" "RiskTargetType",
  "target_id" UUID,
  "likelihood" INTEGER NOT NULL,
  "impact" INTEGER NOT NULL,
  "inherent_score" INTEGER NOT NULL,
  "residual_score" INTEGER NOT NULL,
  "status" "RiskStatus" NOT NULL DEFAULT 'IDENTIFIED',
  "review_due_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "risks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "risks_organization_id_status_residual_score_idx" ON "risks"("organization_id", "status", "residual_score");
CREATE INDEX "risks_organization_id_target_type_target_id_idx" ON "risks"("organization_id", "target_type", "target_id");

CREATE TABLE "controls" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT NOT NULL,
  "control_type" VARCHAR(60) NOT NULL,
  "owner_name" VARCHAR(120) NOT NULL,
  "frequency" VARCHAR(60) NOT NULL,
  "status" "ControlStatus" NOT NULL DEFAULT 'DESIGN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "controls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "controls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "controls_organization_id_name_key" ON "controls"("organization_id", "name");
CREATE INDEX "controls_organization_id_status_idx" ON "controls"("organization_id", "status");

CREATE TABLE "risk_controls" (
  "id" UUID NOT NULL,
  "risk_id" UUID NOT NULL,
  "control_id" UUID NOT NULL,
  "effectiveness" INTEGER NOT NULL DEFAULT 0,
  "last_tested_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_controls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_controls_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "risk_controls_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "risk_controls_risk_id_control_id_key" ON "risk_controls"("risk_id", "control_id");
CREATE INDEX "risk_controls_control_id_idx" ON "risk_controls"("control_id");

CREATE TABLE "risk_treatments" (
  "id" UUID NOT NULL,
  "risk_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "owner_name" VARCHAR(120) NOT NULL,
  "due_at" TIMESTAMP(3) NOT NULL,
  "status" "RiskTreatmentStatus" NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "risk_treatments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_treatments_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "risk_treatments_risk_id_status_due_at_idx" ON "risk_treatments"("risk_id", "status", "due_at");

ALTER TABLE "risks" ADD CONSTRAINT "risks_likelihood_range" CHECK ("likelihood" BETWEEN 1 AND 5);
ALTER TABLE "risks" ADD CONSTRAINT "risks_impact_range" CHECK ("impact" BETWEEN 1 AND 5);
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_effectiveness_range" CHECK ("effectiveness" BETWEEN 0 AND 100);
