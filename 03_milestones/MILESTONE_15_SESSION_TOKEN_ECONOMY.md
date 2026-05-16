# Milestone 15 — Session Token Economy


## Goal

Replace monetization with free party tokens that guests receive for joining and hosts can grant.

## Build Scope

Create:

```text
TokenModule
GuestWalletService
TokenLedgerService
BoostService
```

Tables:

```text
guest_wallets
token_ledger
```

## Token Types

```text
BOOST
CHALLENGE
```

## APIs

```http
GET /api/v1/guests/me/wallet
POST /api/v1/queue/:entryId/apply-boost
POST /api/v1/queue/:entryId/challenge-lock
POST /api/v1/sessions/:sessionId/guests/:guestId/grant-tokens
```

## Rules

- Joining grants initial tokens from session settings.
- Boost consumes BOOST token.
- Boost increases queue entry `boostCredits`.
- Boost recalculates score.
- Challenge consumes CHALLENGE token.
- Challenge unlocks locked track.
- Token spend is transactional.
- Token spend is idempotent.
- Tokens cannot be purchased in MVP.

## Tests

- Join creates wallet.
- Join grants default tokens.
- Boost spends token and changes score.
- Cannot boost without token.
- Challenge spends token and unlocks.
- Host grant works.
- Ledger is accurate.

## Transition to Milestone 16

Token economy creates abuse risk, so moderation comes next.



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
Implement Milestone 15: Session Token Economy.

Create TokenModule, GuestWalletService, TokenLedgerService, BoostService.

Endpoints:
GET /api/v1/guests/me/wallet
POST /api/v1/queue/:entryId/apply-boost
POST /api/v1/queue/:entryId/challenge-lock
POST /api/v1/sessions/:sessionId/guests/:guestId/grant-tokens

Rules:
- tokens are free
- no Stripe/IAP/Google Play
- boost only changes internal score
- challenge only unlocks internal lock
- no token action calls Spotify

Add transaction/idempotency tests.
```
