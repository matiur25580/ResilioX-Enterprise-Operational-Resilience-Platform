CREATE TYPE "SupplierAssessmentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED');
CREATE TYPE "SupplierContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED');
CREATE TYPE "SupplierEvidenceType" AS ENUM ('CERTIFICATION', 'AUDIT_REPORT', 'TEST_RESULT', 'POLICY', 'CONTRACT', 'OTHER');

CREATE TABLE "supplier_contracts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "contract_reference" VARCHAR(120) NOT NULL,
  "status" "SupplierContractStatus" NOT NULL DEFAULT 'DRAFT',
  "effective_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "renewal_notice_days" INTEGER,
  "recovery_time_hours" INTEGER,
  "recovery_point_minutes" INTEGER,
  "service_credit_terms" TEXT,
  "exit_assistance_terms" TEXT,
  "data_return_terms" TEXT,
  "owner_name" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_contracts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_contracts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_contracts_recovery_time_hours_check" CHECK ("recovery_time_hours" IS NULL OR "recovery_time_hours" >= 0),
  CONSTRAINT "supplier_contracts_recovery_point_minutes_check" CHECK ("recovery_point_minutes" IS NULL OR "recovery_point_minutes" >= 0),
  CONSTRAINT "supplier_contracts_renewal_notice_days_check" CHECK ("renewal_notice_days" IS NULL OR "renewal_notice_days" >= 0)
);
CREATE UNIQUE INDEX "supplier_contracts_organization_id_contract_reference_key" ON "supplier_contracts"("organization_id", "contract_reference");
CREATE INDEX "supplier_contracts_organization_id_status_expires_at_idx" ON "supplier_contracts"("organization_id", "status", "expires_at");
CREATE INDEX "supplier_contracts_supplier_id_status_idx" ON "supplier_contracts"("supplier_id", "status");

CREATE TABLE "supplier_contract_services" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "contract_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  CONSTRAINT "supplier_contract_services_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_contract_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_contract_services_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "supplier_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "supplier_contract_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "business_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "supplier_contract_services_contract_id_service_id_key" ON "supplier_contract_services"("contract_id", "service_id");
CREATE INDEX "supplier_contract_services_organization_id_service_id_idx" ON "supplier_contract_services"("organization_id", "service_id");

CREATE TABLE "supplier_assessments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "SupplierAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "owner_name" VARCHAR(120) NOT NULL,
  "resilience_score" INTEGER NOT NULL,
  "security_score" INTEGER NOT NULL,
  "concentration_score" INTEGER NOT NULL,
  "rationale" TEXT NOT NULL,
  "assessed_at" TIMESTAMP(3),
  "next_review_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_assessments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_assessments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_assessments_score_check" CHECK ("resilience_score" BETWEEN 1 AND 5 AND "security_score" BETWEEN 1 AND 5 AND "concentration_score" BETWEEN 1 AND 5),
  CONSTRAINT "supplier_assessments_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "supplier_assessments_organization_id_supplier_id_version_key" ON "supplier_assessments"("organization_id", "supplier_id", "version");
CREATE INDEX "supplier_assessments_organization_id_status_updated_at_idx" ON "supplier_assessments"("organization_id", "status", "updated_at");
CREATE INDEX "supplier_assessments_supplier_id_assessed_at_idx" ON "supplier_assessments"("supplier_id", "assessed_at");

CREATE TABLE "supplier_evidence" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "evidence_type" "SupplierEvidenceType" NOT NULL,
  "reference" VARCHAR(1000) NOT NULL,
  "expires_at" TIMESTAMP(3),
  "recorded_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_evidence_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "supplier_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "supplier_evidence_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "supplier_evidence_organization_id_assessment_id_expires_at_idx" ON "supplier_evidence"("organization_id", "assessment_id", "expires_at");
