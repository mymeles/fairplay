# Data Model

## users

Host-level users.

```sql
id uuid primary key
email text null
display_name text null
created_at timestamptz not null
updated_at timestamptz not null
```

## spotify_tokens

```sql
id uuid primary key
user_id uuid not null references users(id)
encrypted_refresh_token text not null
access_token_hash text null
expires_at timestamptz not null
scopes text[] not null
created_at timestamptz not null
updated_at timestamptz not null
```

Never expose token values to frontend. Never log token values.

## party_sessions

```sql
id uuid primary key
host_user_id uuid not null references users(id)
join_code text unique not null
qr_token_hash text not null
status text not null
selected_spotify_device_id text null
venue_lat numeric null
venue_lng numeric null
venue_radius_meters int null
settings_json jsonb not null
created_at timestamptz not null
expires_at timestamptz not null
ended_at timestamptz null
```

Statuses:

```text
ACTIVE
PAUSED
ENDED
EXPIRED
```

## session_guests

```sql
id uuid primary key
session_id uuid not null references party_sessions(id)
display_name text not null
device_hash text null
role text not null default 'GUEST'
status text not null default 'ACTIVE'
joined_at timestamptz not null
last_seen_at timestamptz null
```

Statuses:

```text
ACTIVE
MUTED
BANNED
LEFT
```

## tracks

```sql
id uuid primary key
spotify_uri text unique not null
spotify_track_id text not null
title text not null
artist text not null
album text null
duration_ms int not null
artwork_url text null
explicit boolean not null default false
created_at timestamptz not null
```

## queue_entries

```sql
id uuid primary key
session_id uuid not null references party_sessions(id)
track_id uuid not null references tracks(id)
added_by_guest_id uuid references session_guests(id)
status text not null
upvotes int not null default 0
downvotes int not null default 0
boost_credits int not null default 0
score numeric not null default 0
locked_until timestamptz null
host_pinned boolean not null default false
spotify_queued_at timestamptz null
playing_at timestamptz null
played_at timestamptz null
removed_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
```

Statuses:

```text
PENDING
LOCKED
QUEUED_TO_SPOTIFY
PLAYING
PLAYED
REMOVED
VETOED
```

## votes

```sql
id uuid primary key
entry_id uuid not null references queue_entries(id)
guest_id uuid not null references session_guests(id)
value int not null
created_at timestamptz not null
updated_at timestamptz not null
unique(entry_id, guest_id)
```

Value:

```text
1 = upvote
-1 = downvote
```

## guest_wallets

```sql
id uuid primary key
session_id uuid not null references party_sessions(id)
guest_id uuid not null references session_guests(id)
boost_tokens int not null default 0
challenge_tokens int not null default 0
created_at timestamptz not null
updated_at timestamptz not null
unique(session_id, guest_id)
```

## token_ledger

```sql
id uuid primary key
session_id uuid not null references party_sessions(id)
guest_id uuid not null references session_guests(id)
entry_id uuid null references queue_entries(id)
token_type text not null
amount int not null
reason text not null
created_at timestamptz not null
```

Token types:

```text
BOOST
CHALLENGE
HOST_GRANT
JOIN_GRANT
ADMIN_ADJUSTMENT
```

## audit_logs

```sql
id uuid primary key
session_id uuid null
actor_type text not null
actor_id uuid null
action text not null
target_type text null
target_id uuid null
metadata jsonb not null default '{}'
created_at timestamptz not null
```

## Recommended Indexes

```sql
create index idx_party_sessions_host_status on party_sessions(host_user_id, status);
create index idx_session_guests_session on session_guests(session_id);
create index idx_queue_entries_session_status on queue_entries(session_id, status);
create index idx_queue_entries_session_score on queue_entries(session_id, score desc);
create index idx_votes_entry on votes(entry_id);
create index idx_token_ledger_guest on token_ledger(guest_id, created_at desc);
create index idx_audit_logs_session on audit_logs(session_id, created_at desc);
```
