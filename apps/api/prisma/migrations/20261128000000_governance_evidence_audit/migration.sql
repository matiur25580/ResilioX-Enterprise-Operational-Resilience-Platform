-- Milestone 13: governance evidence, policy mapping and audit immutability.
CREATE TYPE "GovernanceEvidenceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED');
CREATE TYPE "GovernanceEvidenceType" AS ENUM ('POLICY', 'DOCUMENT', 'AUDIT_REPORT', 'CERTIFICATION', 'TEST_RESULT', 'EXERCISE_RESULT', 'CONTRACT', 'OTHER');
CREATE TYPE "GovernancePolicyStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ACTIVE', 'RETIRED');

CREATE TABLE "governance_evidence" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "evidence_type" "GovernanceEvidenceType" NOT NULL,
  "status" "GovernanceEvidenceStatus" NOT NULL DEFAULT 'DRAFT',
  "reference_uri" VARCHAR(1000) NOT NULL,
  "description" TEXT,
  "target_type" VARCHAR(80),
  "target_id" VARCHAR(120),
  "issued_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "checksum_sha256" VARCHAR(64),
  "created_by_user_id" UUID NOT NULL,
  "reviewed_by_user_id" UUID,
  "review_rationale" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "governance_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "governance_evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "governance_evidence_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "governance_evidence_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "governance_evidence_checksum_sha256_check" CHECK ("checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[A-Fa-f0-9]{64}$')
);
CREATE INDEX "governance_evidence_organization_id_status_expires_at_idx" ON "governance_evidence"("organization_id", "status", "expires_at");
CREATE INDEX "governance_evidence_organization_id_evidence_type_created_at_idx" ON "governance_evidence"("organization_id", "evidence_type", "created_at");
CREATE INDEX "governance_evidence_organization_id_target_type_target_id_idx" ON "governance_evidence"("organization_id", "target_type", "target_id");

CREATE TABLE "governance_policies" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "framework" VARCHAR(100) NOT NULL,
  "control_reference" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "submitted_by_user_id" UUID,
  "approved_by_user_id" UUID,
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "approval_rationale" TEXT,
  "status" "GovernancePolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "review_due_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "governance_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "governance_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "governance_policies_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "governance_policies_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "governance_policies_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "governance_policies_organization_id_framework_control_reference_key" ON "governance_policies"("organization_id", "framework", "control_reference");
CREATE INDEX "governance_policies_organization_id_status_review_due_at_idx" ON "governance_policies"("organization_id", "status", "review_due_at");

CREATE TABLE "policy_evidence_links" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "policy_id" UUID NOT NULL,
  "evidence_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_evidence_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "policy_evidence_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "policy_evidence_links_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "governance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "policy_evidence_links_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "governance_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "policy_evidence_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "policy_evidence_links_policy_id_evidence_id_key" ON "policy_evidence_links"("policy_id", "evidence_id");
CREATE INDEX "policy_evidence_links_organization_id_evidence_id_idx" ON "policy_evidence_links"("organization_id", "evidence_id");

-- Prevent mutation of the audit ledger through ordinary application connections.
-- A separately controlled maintenance session may set app.audit_maintenance='on' for retention operations.
CREATE OR REPLACE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
BEGIN
  -- Permit only FK-driven anonymization when a referenced organization/user is removed.
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS NULL AND OLD.organization_id IS NOT NULL
     AND (to_jsonb(NEW) - 'organization_id') = (to_jsonb(OLD) - 'organization_id') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.actor_user_id IS NULL AND OLD.actor_user_id IS NOT NULL
     AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
    RETURN NEW;
  END IF;
  IF current_user <> 'continuitygrid_audit_maintenance' THEN
    RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
