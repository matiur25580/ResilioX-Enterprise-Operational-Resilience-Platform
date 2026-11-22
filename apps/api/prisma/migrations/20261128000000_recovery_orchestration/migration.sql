CREATE TYPE "RecoveryRunbookStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'RETIRED');
CREATE TYPE "RecoverySimulationStatus" AS ENUM ('PLANNED', 'READY', 'RUNNING', 'COMPLETED', 'BLOCKED', 'CANCELLED');
CREATE TYPE "RecoveryStepStatus" AS ENUM ('PENDING', 'READY', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'SKIPPED');

CREATE TABLE "recovery_runbooks" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "continuity_plan_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "RecoveryRunbookStatus" NOT NULL DEFAULT 'DRAFT',
  "title" VARCHAR(180) NOT NULL,
  "description" TEXT NOT NULL,
  "owner_name" VARCHAR(120) NOT NULL,
  "rto_minutes" INTEGER,
  "rpo_minutes" INTEGER,
  "review_due_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "approved_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recovery_runbooks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "recovery_runbook_steps" (
  "id" UUID NOT NULL,
  "runbook_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "description" TEXT NOT NULL,
  "responsible_role" VARCHAR(100) NOT NULL,
  "estimated_minutes" INTEGER NOT NULL,
  "validation_criteria" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recovery_runbook_steps_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "recovery_step_dependencies" (
  "id" UUID NOT NULL,
  "predecessor_step_id" UUID NOT NULL,
  "successor_step_id" UUID NOT NULL,
  CONSTRAINT "recovery_step_dependencies_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "recovery_simulations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "runbook_id" UUID NOT NULL,
  "incident_id" UUID,
  "runbook_version" INTEGER NOT NULL,
  "status" "RecoverySimulationStatus" NOT NULL DEFAULT 'PLANNED',
  "target_rto_minutes" INTEGER,
  "target_rpo_minutes" INTEGER,
  "simulated_elapsed_minutes" INTEGER,
  "data_loss_assumption_minutes" INTEGER,
  "dependency_snapshot" JSONB,
  "summary" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recovery_simulations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "recovery_simulation_steps" (
  "id" UUID NOT NULL,
  "simulation_id" UUID NOT NULL,
  "runbook_step_id" UUID NOT NULL,
  "status" "RecoveryStepStatus" NOT NULL DEFAULT 'PENDING',
  "operator_name" VARCHAR(120),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "outcome" TEXT,
  "rationale" TEXT,
  "evidence_reference" VARCHAR(500),
  "waiver_rationale" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recovery_simulation_steps_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "recovery_events" (
  "id" UUID NOT NULL,
  "simulation_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "event_type" VARCHAR(80) NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recovery_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recovery_runbooks_org_service_title_version_key" ON "recovery_runbooks"("organization_id", "service_id", "title", "version");
CREATE INDEX "recovery_runbooks_org_status_updated_idx" ON "recovery_runbooks"("organization_id", "status", "updated_at");
CREATE INDEX "recovery_runbooks_service_status_idx" ON "recovery_runbooks"("service_id", "status");
CREATE UNIQUE INDEX "recovery_runbook_steps_runbook_sequence_key" ON "recovery_runbook_steps"("runbook_id", "sequence");
CREATE INDEX "recovery_runbook_steps_runbook_idx" ON "recovery_runbook_steps"("runbook_id");
CREATE UNIQUE INDEX "recovery_step_dependencies_predecessor_successor_key" ON "recovery_step_dependencies"("predecessor_step_id", "successor_step_id");
CREATE INDEX "recovery_step_dependencies_successor_idx" ON "recovery_step_dependencies"("successor_step_id");
CREATE INDEX "recovery_simulations_org_status_created_idx" ON "recovery_simulations"("organization_id", "status", "created_at");
CREATE INDEX "recovery_simulations_runbook_created_idx" ON "recovery_simulations"("runbook_id", "created_at");
CREATE INDEX "recovery_simulations_incident_idx" ON "recovery_simulations"("incident_id");
CREATE UNIQUE INDEX "recovery_simulation_steps_simulation_runbook_step_key" ON "recovery_simulation_steps"("simulation_id", "runbook_step_id");
CREATE INDEX "recovery_simulation_steps_simulation_status_idx" ON "recovery_simulation_steps"("simulation_id", "status");
CREATE INDEX "recovery_events_simulation_created_idx" ON "recovery_events"("simulation_id", "created_at");

ALTER TABLE "recovery_runbooks" ADD CONSTRAINT "recovery_runbooks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recovery_runbooks" ADD CONSTRAINT "recovery_runbooks_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "business_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recovery_runbooks" ADD CONSTRAINT "recovery_runbooks_continuity_plan_id_fkey" FOREIGN KEY ("continuity_plan_id") REFERENCES "continuity_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recovery_runbooks" ADD CONSTRAINT "recovery_runbooks_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recovery_runbook_steps" ADD CONSTRAINT "recovery_runbook_steps_runbook_id_fkey" FOREIGN KEY ("runbook_id") REFERENCES "recovery_runbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_step_dependencies" ADD CONSTRAINT "recovery_step_dependencies_predecessor_step_id_fkey" FOREIGN KEY ("predecessor_step_id") REFERENCES "recovery_runbook_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_step_dependencies" ADD CONSTRAINT "recovery_step_dependencies_successor_step_id_fkey" FOREIGN KEY ("successor_step_id") REFERENCES "recovery_runbook_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_simulations" ADD CONSTRAINT "recovery_simulations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recovery_simulations" ADD CONSTRAINT "recovery_simulations_runbook_id_fkey" FOREIGN KEY ("runbook_id") REFERENCES "recovery_runbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recovery_simulations" ADD CONSTRAINT "recovery_simulations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recovery_simulation_steps" ADD CONSTRAINT "recovery_simulation_steps_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "recovery_simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_simulation_steps" ADD CONSTRAINT "recovery_simulation_steps_runbook_step_id_fkey" FOREIGN KEY ("runbook_step_id") REFERENCES "recovery_runbook_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recovery_events" ADD CONSTRAINT "recovery_events_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "recovery_simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
