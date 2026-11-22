-- Prevent duplicate typed dependency edges within a tenant.
CREATE UNIQUE INDEX "dependencies_tenant_edge_type_key"
ON "dependencies" ("organization_id", "source_type", "source_id", "target_type", "target_id", "type");
