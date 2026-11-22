# Contributing

Thank you for helping improve ContinuityGrid.

## Engineering principles
- Keep domain logic out of route handlers and UI components.
- Validate all untrusted input at system boundaries.
- Enforce tenant scope and permissions on the server.
- Prefer small, reviewable changes with focused tests.
- Document business rules and assumptions.
- Label mock, demo and simulated data honestly.

## Workflow
1. Create a focused branch from the current default branch.
2. Review the relevant architecture and roadmap documents.
3. Implement the smallest coherent change.
4. Add or update tests for behavior and authorization.
5. Run formatting, linting, type checks and tests.
6. Update documentation when behavior or contracts change.
7. Open a pull request with context, screenshots where relevant, and test evidence.

## Commit messages
Use concise conventional prefixes where practical:
- `feat:` new capability
- `fix:` bug fix
- `docs:` documentation
- `refactor:` internal restructuring
- `test:` test changes
- `chore:` tooling and maintenance

## Pull request checklist
- [ ] Scope and acceptance criteria are clear.
- [ ] Tenant isolation and authorization are considered.
- [ ] Validation and error handling are implemented.
- [ ] Tests cover normal, edge and failure cases.
- [ ] No secrets or real customer data are included.
- [ ] Documentation reflects actual behavior.
- [ ] Simulated behavior is labelled.

## Security reports
Do not publish exploit details or credentials in public issues. Contact the repository maintainer privately.
