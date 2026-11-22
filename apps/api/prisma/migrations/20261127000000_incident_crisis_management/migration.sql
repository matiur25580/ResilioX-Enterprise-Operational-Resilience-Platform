CREATE TYPE "IncidentSeverity" AS ENUM ('SEV1', 'SEV2', 'SEV3', 'SEV4');
CREATE TYPE "IncidentStatus" AS ENUM ('DETECTED', 'TRIAGED', 'ACTIVE', 'MITIGATING', 'RESOLVED', 'CLOSED', 'CANCELLED');

CREATE TABLE "incidents" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "reference" VARCHAR(24) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "description" TEXT NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "severity" "IncidentSeverity" NOT NULL DEFAULT 'SEV3',
  "status" "IncidentStatus" NOT NULL DEFAULT 'DETECTED',
  "commander_name" VARCHAR(120) NOT NULL,
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "incidents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "incidents_organization_id_reference_key" ON "incidents"("organization_id", "reference");
CREATE INDEX "incidents_organization_id_status_severity_detected_at_idx" ON "incidents"("organization_id", "status", "severity", "detected_at");
CREATE INDEX "incidents_organization_id_updated_at_idx" ON "incidents"("organization_id", "updated_at");

CREATE TABLE "incident_events" (
  "id" UUID NOT NULL,
  "incident_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "event_type" VARCHAR(80) NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "incident_events_incident_id_created_at_idx" ON "incident_events"("incident_id", "created_at");

CREATE TABLE "incident_tasks" (
  "id" UUID NOT NULL,
  "incident_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "owner_name" VARCHAR(120) NOT NULL,
  "priority" "IncidentSeverity" NOT NULL DEFAULT 'SEV3',
  "status" "ContinuityActionStatus" NOT NULL DEFAULT 'OPEN',
  "due_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "incident_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "incident_tasks_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "incident_tasks_incident_id_status_due_at_idx" ON "incident_tasks"("incident_id", "status", "due_at");
