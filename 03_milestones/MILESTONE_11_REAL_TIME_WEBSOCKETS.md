# Milestone 11 — Real-Time WebSockets


## Goal

Broadcast session, queue, voting, token, lock, and now-playing changes in real time.

## Build Scope

Create:

```text
RealtimeModule
PartyGateway
RealtimeEventPublisher
```

Rooms:

```text
party:{sessionId}
host:{sessionId}
guest:{guestId}
```

## Events

```text
session.updated
guest.joined
queue.updated
vote.updated
track.locked
track.unlocked
token.updated
track.queued_to_spotify
now_playing.updated
runner.status_changed
session.ended
```

## Rules

- Guest can only join their party room.
- Host can join host room for their session.
- Events include sequence number.
- Client can ignore duplicate events.
- Server supports reconnect.

## Tests

- Guest joins correct room.
- Unauthorized guest rejected.
- Queue update broadcast.
- Vote update broadcast.
- Event sequence increases.
- Reconnect works.

## Transition to Milestone 12

The runner will publish Spotify dispatch events through this layer.



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
Implement Milestone 11: Real-Time WebSockets.

Create RealtimeModule, PartyGateway, RealtimeEventPublisher.

Rooms:
party:{sessionId}
host:{sessionId}
guest:{guestId}

Events:
session.updated
guest.joined
queue.updated
vote.updated
track.locked
track.unlocked
token.updated
track.queued_to_spotify
now_playing.updated
runner.status_changed
session.ended

Integrate event publishing into queue, vote, lock, and token services.
Add authorization and reconnect tests.
```
