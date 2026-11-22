# API Guidelines

## Base path and format
- Base path: `/api/v1`.
- JSON request and response bodies unless a documented export endpoint applies.
- UTF-8 encoding and ISO 8601 UTC timestamps.
- Use plural resource names and standard HTTP methods.

## HTTP semantics
- `GET`: read without side effects.
- `POST`: create a resource or execute an explicit command.
- `PUT`: replace a resource representation.
- `PATCH`: partially update a resource.
- `DELETE`: remove or archive according to the resource lifecycle policy.

## Response shape

Successful single-resource responses should be consistent, for example:

```json
{
  "data": {
    "id": "resource-id"
  },
  "meta": {
    "requestId": "request-id"
  }
}
```

Collection responses should include pagination metadata:

```json
{
  "data": [],
  "meta": {
    "requestId": "request-id",
    "pagination": {
      "page": 1,
      "pageSize": 25,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

## Error shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be processed.",
    "details": [],
    "requestId": "request-id"
  }
}
```

Do not expose stack traces, SQL details, internal paths or secrets in client responses.

## Validation and authorization
- Validate params, query strings and request bodies using shared Zod schemas.
- Reject unknown or disallowed fields where appropriate.
- Authenticate before accessing protected resources.
- Authorize every operation against tenant scope and permissions.
- Return consistent 401, 403, 404, 409, 422 and 429 behavior.
- Avoid leaking whether another tenant owns a resource.

## Pagination and filtering
- Paginate all potentially unbounded collections.
- Enforce maximum page size.
- Use deterministic sorting with a stable tie-breaker.
- Allowlist sortable and filterable fields.
- Document filter semantics and timezone handling.

## Idempotency and concurrency
- Use idempotency keys for retryable commands that create external effects or duplicate-sensitive records.
- Use optimistic concurrency/version fields for collaborative updates where lost updates are possible.
- Return 409 for conflicting state transitions.

## Documentation
OpenAPI must describe authentication, tenant context, schemas, error codes, pagination, permissions and examples. Examples must use fictional data.
