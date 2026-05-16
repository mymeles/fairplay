-- Milestone 16: moderation and abuse protection.
--
-- Blacklists are session-scoped and controlled by the host. Guest discipline
-- reuses session_guests.status from M04; no new enum is needed.

create table if not exists public.session_track_blacklist (
    id                  uuid primary key default uuid_generate_v4(),
    session_id          uuid not null references public.party_sessions(id) on delete cascade,
    spotify_track_id    text not null,
    spotify_uri         text,
    title               text,
    created_by_user_id  uuid not null references public.users(id) on delete cascade,
    created_at          timestamptz not null default now(),
    constraint session_track_blacklist_track_id_nonempty check (length(trim(spotify_track_id)) > 0),
    constraint session_track_blacklist_uri_check check (
        spotify_uri is null or spotify_uri ~ '^spotify:track:[A-Za-z0-9]+$'
    ),
    constraint session_track_blacklist_session_track_unique unique (session_id, spotify_track_id)
);

create index if not exists idx_session_track_blacklist_session
    on public.session_track_blacklist(session_id);

alter table public.session_track_blacklist enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'session_track_blacklist'
          and policyname = 'deny_anon_session_track_blacklist'
    ) then
        create policy deny_anon_session_track_blacklist on public.session_track_blacklist
            for all to anon, authenticated using (false) with check (false);
    end if;
end $$;


create table if not exists public.session_artist_blacklist (
    id                      uuid primary key default uuid_generate_v4(),
    session_id              uuid not null references public.party_sessions(id) on delete cascade,
    artist_name             text not null,
    normalized_artist_name  text not null,
    created_by_user_id      uuid not null references public.users(id) on delete cascade,
    created_at              timestamptz not null default now(),
    constraint session_artist_blacklist_artist_nonempty check (length(trim(artist_name)) > 0),
    constraint session_artist_blacklist_normalized_nonempty check (length(trim(normalized_artist_name)) > 0),
    constraint session_artist_blacklist_session_artist_unique unique (session_id, normalized_artist_name)
);

create index if not exists idx_session_artist_blacklist_session
    on public.session_artist_blacklist(session_id);

alter table public.session_artist_blacklist enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'session_artist_blacklist'
          and policyname = 'deny_anon_session_artist_blacklist'
    ) then
        create policy deny_anon_session_artist_blacklist on public.session_artist_blacklist
            for all to anon, authenticated using (false) with check (false);
    end if;
end $$;
