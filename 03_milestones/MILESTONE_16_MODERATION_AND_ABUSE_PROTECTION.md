# Milestone 16 — Moderation and Abuse Protection


## Goal

Protect the party from spam, inappropriate content, and trolls.

## Build Scope

Create:

```text
ModerationModule
ModerationService
RateLimitService
BlacklistService
GuestDisciplineService
```

## Controls

```text
explicit content filter
track blacklist
artist blacklist
guest mute
guest ban
duplicate cooldown
max suggestions per guest
vote rate limit
search rate limit
token spend rate limit
```

## APIs

```http
POST /api/v1/sessions/:sessionId/blacklist/track
POST /api/v1/sessions/:sessionId/blacklist/artist
POST /api/v1/sessions/:sessionId/guests/:guestId/mute
POST /api/v1/sessions/:sessionId/guests/:guestId/ban
DELETE /api/v1/sessions/:sessionId/guests/:guestId/mute
```

## Tests

- Muted guest cannot affect visible queue.
- Banned guest blocked.
- Blacklisted track rejected.
- Blacklisted artist rejected.
- Explicit filter works.
- Rate limits enforced.
- Duplicate cooldown enforced.

## Transition to Milestone 17

After backend safety rules exist, the frontend can expose them.



## Definition of Done

- Unit tests added.
- Integration tests added where applicable.
- Authorization rules tested.
- Error cases tested.
- Logs added for important actions.
- README or docs updated.
- Manual test steps written.
- No future milestone scope implemented.


## Codex/GPT-5.5 Prompt

```text
Implement Milestone 16: Moderation and Abuse Protection.

Create ModerationModule, ModerationService, RateLimitService, BlacklistService, GuestDisciplineService.

Add host moderation endpoints.

Integrate checks into:
- join
- search
- queue add
- vote
- boost
- challenge

Add tests for muted, banned, blacklisted, explicit, duplicate, and rate-limited flows.
```
