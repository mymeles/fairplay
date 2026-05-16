-- Milestone 4: party sessions, guests, and per-guest token wallets.
--
-- party_sessions  — one row per host-created party session
-- session_guests  — one row per guest who joined a session
-- guest_wallets   — free-token balance per (session, guest)

create table if not exists public.party_sessions (
    id                          uuid primary key default uuid_generate_v4(),
    host_user_id                uuid not null references public.users(id) on delete cascade,
    join_code                   text not null,
    qr_token_hash               text not null,
    status                      text not null default 'ACTIVE',
    selected_spotify_device_id  text,
    venue_lat                   numeric,
    venue_lng                   numeric,
    venue_radius_meters         int,
    settings_json               jsonb not null default '{}'::jsonb,
    created_at                  timestamptz not null default now(),
    expires_at                  timestamptz not null,
    ended_at                    timestamptz,
    constraint party_sessions_status_check check (status in ('ACTIVE','PAUSED','ENDED','EXPIRED'))
);

-- Two sessions can share an old join_code only if at least one is no longer
-- active; enforce uniqueness of join_code among ACTIVE sessions only.
create unique index if not exists ux_party_sessions_join_code_active
    on public.party_sessions(join_code)
    where status = 'ACTIVE';

create index if not exists idx_party_sessions_host_status on public.party_sessions(host_user_id, status);
create index if not exists idx_party_sessions_status_expires on public.party_sessions(status, expires_at);

alter table public.party_sessions enable row level security;
create policy if not exists deny_anon_party_sessions on public.party_sessions
    for all to anon, authenticated using (false) with check (false);

drop trigger if exists set_updated_at on public.party_sessions;
-- party_sessions has no updated_at column by spec — skip the trigger.


create table if not exists public.session_guests (
    id              uuid primary key default uuid_generate_v4(),
    session_id      uuid not null references public.party_sessions(id) on delete cascade,
    display_name    text not null,
    device_hash     text,
    role            text not null default 'GUEST',
    status          text not null default 'ACTIVE',
    joined_at       timestamptz not null default now(),
    last_seen_at    timestamptz,
    constraint session_guests_role_check check (role in ('GUEST','HOST_ATTENDEE')),
    constraint session_guests_status_check check (status in ('ACTIVE','MUTED','BANNED','LEFT'))
);

create index if not exists idx_session_guests_session on public.session_guests(session_id);
create index if not exists idx_session_guests_session_device on public.session_guests(session_id, device_hash);

alter table public.session_guests enable row level security;
create policy if not exists deny_anon_session_guests on public.session_guests
    for all to anon, authenticated using (false) with check (false);


create table if not exists public.guest_wallets (
    id                 uuid primary key default uuid_generate_v4(),
    session_id         uuid not null references public.party_sessions(id) on delete cascade,
    guest_id           uuid not null references public.session_guests(id) on delete cascade,
    boost_tokens       int not null default 0,
    challenge_tokens   int not null default 0,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    unique(session_id, guest_id),
    constraint guest_wallets_boost_nonneg check (boost_tokens >= 0),
    constraint guest_wallets_challenge_nonneg check (challenge_tokens >= 0)
);

create index if not exists idx_guest_wallets_guest on public.guest_wallets(guest_id);

alter table public.guest_wallets enable row level security;
create policy if not exists deny_anon_guest_wallets on public.guest_wallets
    for all to anon, authenticated using (false) with check (false);

drop trigger if exists set_updated_at on public.guest_wallets;
create trigger set_updated_at before update on public.guest_wallets
    for each row execute function public.tg_set_updated_at();
