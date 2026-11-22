CREATE TYPE "ContinuityPlanStatus" AS ENUM ('DRAFT','IN_REVIEW','APPROVED','RETIRED');
CREATE TYPE "ContinuityExerciseType" AS ENUM ('TABLETOP','WALKTHROUGH','SIMULATION','FULL_SCALE');
CREATE TYPE "ContinuityExerciseStatus" AS ENUM ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED');
CREATE TYPE "ContinuityExerciseResult" AS ENUM ('SUCCESS','PARTIAL_FAILURE','FAILURE');
CREATE TYPE "ContinuityActionStatus" AS ENUM ('OPEN','IN_PROGRESS','BLOCKED','COMPLETED');
CREATE TYPE "ContinuityActionSeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');

CREATE TABLE "continuity_plans" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "title" VARCHAR(180) NOT NULL,
  "owner_name" VARCHAR(120) NOT NULL,
  "scope" TEXT NOT NULL,
  "activation_criteria" TEXT NOT NULL,
  "recovery_strategy" TEXT NOT NULL,
  "recovery_procedures" TEXT NOT NULL,
  "communications_plan" TEXT NOT NULL,
  "rto_minutes" INTEGER NOT NULL,
  "rpo_minutes" INTEGER NOT NULL,
  "status" "ContinuityPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "review_due_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "submitted_by" UUID,
  "approved_at" TIMESTAMP(3),
  "approved_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "continuity_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "continuity_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "continuity_plans_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "business_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "continuity_plans_organization_id_service_id_version_key" ON "continuity_plans"("organization_id","service_id","version");
CREATE INDEX "continuity_plans_organization_id_status_review_due_at_idx" ON "continuity_plans"("organization_id","status","review_due_at");
CREATE INDEX "continuity_plans_service_id_updated_at_idx" ON "continuity_plans"("service_id","updated_at");

CREATE TABLE "continuity_exercises" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "exercise_type" "ContinuityExerciseType" NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "scenario" TEXT NOT NULL,
  "objectives" TEXT NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "status" "ContinuityExerciseStatus" NOT NULL DEFAULT 'PLANNED',
  "result" "ContinuityExerciseResult",
  "findings" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "continuity_exercises_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "continuity_exercises_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "continuity_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "continuity_exercises_plan_id_scheduled_at_idx" ON "continuity_exercises"("plan_id","scheduled_at");
CREATE INDEX "continuity_exercises_status_scheduled_at_idx" ON "continuity_exercises"("status","scheduled_at");

CREATE TABLE "continuity_actions" (
  "id" UUID NOT NULL,
  "exercise_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "owner_name" VARCHAR(120) NOT NULL,
  "severity" "ContinuityActionSeverity" NOT NULL DEFAULT 'MEDIUM',
  "due_at" TIMESTAMP(3) NOT NULL,
  "status" "ContinuityActionStatus" NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "continuity_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "continuity_actions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "continuity_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "continuity_actions_exercise_id_status_due_at_idx" ON "continuity_actions"("exercise_id","status","due_at");
