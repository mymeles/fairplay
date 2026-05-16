# Project Context

## Working Name

FairPlay Party DJ

## Mission

Create a fair, fun, party-centered music queue platform where the host keeps control of Spotify playback and guests influence the queue through voting and free session tokens.

## Core Problem

At house parties and gatherings, music choice often becomes chaotic:

- People grab the host's phone.
- Songs get skipped unfairly.
- A few loud guests dominate the queue.
- Hosts lose control.
- Guests want a fun way to influence what plays next.

FairPlay Party DJ solves this by making the host the playback owner while guests interact through a controlled web session.

## MVP Scope

The MVP should support:

- Host Spotify authentication.
- Host device selection.
- Party session creation.
- QR/session-key guest join.
- Optional proximity gate.
- Track search using Spotify metadata.
- Internal queue.
- Voting.
- Free session token wallet.
- Token boost.
- Lock-window challenge.
- Queue runner that appends eligible tracks to Spotify.
- Now-playing sync.
- Host controls.
- WebSocket real-time UI.
- Logging, metrics, and deployment docs.

## Explicitly Out of Scope for MVP

- Real-money payments.
- Apple IAP.
- Google Play Billing.
- Stripe.
- Music streaming inside our backend.
- Full Spotify queue reordering.
- Removing arbitrary tracks from Spotify queue.
- Guaranteeing exact Spotify playback order beyond our short buffer.

## Product Language

Use:

- "Boost queue priority"
- "Challenge lock"
- "Use party tokens"
- "Host-controlled playback"
- "Fair queue"

Avoid:

- "Pay to play"
- "Guaranteed playback"
- "Buy a song slot"
- "Force Spotify to play"
- "Manipulate Spotify queue"

## Spotify Design Principle

Spotify is not the source of truth. Spotify is an output target.

The internal app queue is the source of truth. The runner only sends the next 1–2 eligible songs to Spotify.
