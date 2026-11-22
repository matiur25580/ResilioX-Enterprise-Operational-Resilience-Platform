-- Initial ContinuityGrid tenant and service catalog schema.
-- Generated as the baseline migration for the Milestone 02 Prisma models.

CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "BusinessServiceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'UNDER_REVIEW', 'RETIRED');
CREATE TYPE "DependencyNodeType" AS ENUM ('BUSINESS_SERVICE', 'BUSINESS_PROCESS', 'APPLICATION', 'TECHNOLOGY_ASSET', 'SUPPLIER');
CREATE TYPE "DependencyType" AS ENUM ('SUPPORTS', 'HOSTED_ON', 'DEPENDS_ON', 'PROVIDED_BY', 'OPERATES_FROM', 'PROCESSED_BY');
CREATE TYPE "DependencyStatus" AS ENUM ('PROPOSED', 'VERIFIED', 'DISPUTED', 'RETIRED');
CREATE TYPE "CriticalityTier" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

CREATE TABLE "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(254) NOT NULL,
  "display_name" VARCHAR(120) NOT NULL,
  "password_hash" VARCHAR(255),
  "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
  "joined_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_services" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "owner_name" VARCHAR(120),
  "criticality" "CriticalityTier" NOT NULL DEFAULT 'MEDIUM',
  "status" "BusinessServiceStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_processes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "owner_name" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_processes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "vendor" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technology_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "asset_type" VARCHAR(80) NOT NULL,
  "environment" VARCHAR(80),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "technology_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "website" VARCHAR(255),
  "contact_email" VARCHAR(254),
  "criticality" "CriticalityTier" NOT NULL DEFAULT 'MEDIUM',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dependencies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "source_type" "DependencyNodeType" NOT NULL,
  "source_id" UUID NOT NULL,
  "target_type" "DependencyNodeType" NOT NULL,
  "target_id" UUID NOT NULL,
  "type" "DependencyType" NOT NULL,
  "status" "DependencyStatus" NOT NULL DEFAULT 'PROPOSED',
  "criticality" "CriticalityTier" NOT NULL DEFAULT 'MEDIUM',
  "confidence" INTEGER NOT NULL DEFAULT 50,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id"),
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_status_idx" ON "organizations"("status");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_display_name_idx" ON "users"("display_name");
CREATE UNIQUE INDEX "memberships_user_id_organization_id_key" ON "memberships"("user_id", "organization_id");
CREATE INDEX "memberships_organization_id_status_idx" ON "memberships"("organization_id", "status");
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");
CREATE UNIQUE INDEX "business_services_organization_id_name_key" ON "business_services"("organization_id", "name");
CREATE INDEX "business_services_organization_id_status_criticality_idx" ON "business_services"("organization_id", "status", "criticality");
CREATE UNIQUE INDEX "business_processes_organization_id_name_key" ON "business_processes"("organization_id", "name");
CREATE INDEX "business_processes_organization_id_idx" ON "business_processes"("organization_id");
CREATE UNIQUE INDEX "applications_organization_id_name_key" ON "applications"("organization_id", "name");
CREATE INDEX "applications_organization_id_idx" ON "applications"("organization_id");
CREATE UNIQUE INDEX "technology_assets_organization_id_name_key" ON "technology_assets"("organization_id", "name");
CREATE INDEX "technology_assets_organization_id_asset_type_idx" ON "technology_assets"("organization_id", "asset_type");
CREATE UNIQUE INDEX "suppliers_organization_id_name_key" ON "suppliers"("organization_id", "name");
CREATE INDEX "suppliers_organization_id_criticality_idx" ON "suppliers"("organization_id", "criticality");
CREATE INDEX "dependencies_organization_id_source_type_source_id_idx" ON "dependencies"("organization_id", "source_type", "source_id");
CREATE INDEX "dependencies_organization_id_target_type_target_id_idx" ON "dependencies"("organization_id", "target_type", "target_id");
CREATE INDEX "dependencies_organization_id_status_criticality_idx" ON "dependencies"("organization_id", "status", "criticality");

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_services" ADD CONSTRAINT "business_services_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_processes" ADD CONSTRAINT "business_processes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technology_assets" ADD CONSTRAINT "technology_assets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
