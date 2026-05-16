# Handy Prompts

## Milestone Kickoff Prompt

```text
Read the current milestone document and implement only that milestone.
Do not implement future milestone features.
Before coding, summarize:
1. files you expect to create/change
2. APIs to add
3. tests to add
4. risks/assumptions

Then implement with tests.
```

## Test Failure Prompt

```text
The tests are failing. Do not rewrite the architecture.
Diagnose the root cause, explain it briefly, then make the smallest code change required.
After fixing, list what changed and which tests now pass.
```

## Refactor Prompt

```text
Refactor this code to match the project standards:
- thin controllers
- business logic in services
- external calls in adapters
- typed DTOs
- domain errors
- structured logs
Do not change behavior. Add/update tests if needed.
```

## Security Review Prompt

```text
Review this milestone for security issues:
- auth bypass
- guest accessing host endpoints
- Spotify token exposure
- missing validation
- missing rate limit
- logging secrets
- replay/double-spend risk
Give exact fixes and implement them with tests.
```

## Logging Review Prompt

```text
Review the changed code for logging quality.
Add structured logs for important success, rejection, and failure paths.
Do not log secrets, OAuth codes, QR raw tokens, or Spotify tokens.
```

## Spotify Integration Prompt

```text
Check this Spotify integration for correctness:
- host token only
- refresh handling
- Premium/403 handling
- 429 Retry-After handling
- no guest Spotify calls
- no token leaks
- no more than 1-2 tracks buffered
Add tests for each failure path.
```

## Frontend Polish Prompt

```text
Improve the frontend UX to match the Gen-Z party design guide:
- mobile-first
- dark mode
- animated queue cards
- clear now-playing panel
- token balance
- lock/challenge states
- accessible buttons
Do not change API contracts.
```

## Handoff Prompt

```text
Create a milestone handoff note:
Completed:
Changed files:
New APIs:
New env vars:
Tests added:
Manual test steps:
Known issues:
Ready for next milestone? yes/no
```
