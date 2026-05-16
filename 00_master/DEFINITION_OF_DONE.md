# Definition of Done

Every milestone is complete only when all of the following are true.

## Code Quality

- Code compiles.
- Lint passes.
- No dead code.
- No placeholder business logic.
- No secrets committed.
- DTOs and entities are typed.
- Errors use standard error response format.
- All public methods have clear responsibility.

## Tests

Each milestone must include:

- Unit tests for core logic.
- Integration tests for API/database/Redis behavior where applicable.
- Mocked Spotify tests where Spotify APIs are involved.
- Negative tests for invalid input and auth errors.
- Regression tests for important edge cases.

## Documentation

Each milestone must update:

- API docs or endpoint list.
- DTO examples.
- Environment variables if new ones are added.
- Manual test instructions.
- Known limitations.

## Observability

Each milestone should add logs for:

- Success path.
- Business rejection path.
- External API errors.
- Security-relevant events.

## Security

- Validate all input.
- Check session/host/guest authorization.
- Rate-limit public endpoints.
- Do not expose Spotify tokens.
- Do not log secrets or OAuth codes.

## Handoff

Before moving to the next milestone, write a short handoff note:

```text
Completed:
Changed files:
New APIs:
New env vars:
Tests added:
Known issues:
Next milestone dependencies:
```
