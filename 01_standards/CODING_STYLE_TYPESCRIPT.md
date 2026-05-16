# TypeScript Coding Style

## Strict TypeScript

Enable:

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUncheckedIndexedAccess": true
}
```

## Prefer Explicit Domain Types

```ts
type SessionId = string;
type GuestId = string;
type QueueEntryId = string;
```

## Avoid Boolean Traps

Bad:

```ts
updateSession(id, true, false);
```

Good:

```ts
updateSession(id, {
  runnerEnabled: true,
  allowExplicitTracks: false,
});
```

## Use Enums for Domain State

```ts
export enum QueueEntryStatus {
  Pending = 'PENDING',
  Locked = 'LOCKED',
  QueuedToSpotify = 'QUEUED_TO_SPOTIFY',
  Playing = 'PLAYING',
  Played = 'PLAYED',
  Removed = 'REMOVED',
  Vetoed = 'VETOED',
}
```

## Function Size

Target:

- Controller method: 5–20 lines.
- Service method: 10–60 lines.
- If bigger, split into smaller private methods or domain services.

## Async Rules

- Always await promises.
- Never ignore promise errors.
- Use `Promise.allSettled` for non-critical fanout.
- Use retries only around external calls, not database writes unless idempotent.

## Comments

Comment the why, not the what.

Good:

```ts
// Keep Spotify queue short because Spotify does not expose reliable full reorder control.
```

Bad:

```ts
// Add number one to count.
```

## DTO Example

```ts
export class JoinSessionDto {
  @IsString()
  @Length(2, 32)
  displayName!: string;

  @IsOptional()
  @IsString()
  joinCode?: string;

  @IsOptional()
  @ValidateNested()
  location?: GuestLocationDto;
}
```
