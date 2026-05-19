-- Milestone 18 fix-up: session names and session-scoped fallback playlists.
--
-- The fallback playlist stores normalized Spotify tracks locally. The runner
-- can enqueue these tracks when the FairPlay queue is empty without searching
-- Spotify or importing an external playlist during runner ticks.

alter table public.party_sessions
    add column if not exists name text;

create table if not exists public.session_fallback_tracks (
    id                  uuid primary key default uuid_generate_v4(),
    session_id          uuid not null references public.party_sessions(id) on delete cascade,
    track_id            uuid not null references public.tracks(id) on delete cascade,
    added_by_user_id    uuid not null references public.users(id) on delete cascade,
    position            int not null,
    enabled             boolean not null default true,
    last_queued_at      timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique(session_id, track_id),
    constraint session_fallback_tracks_position_positive check (position >= 1)
);

create index if not exists idx_session_fallback_tracks_session_position
    on public.session_fallback_tracks(session_id, position);

create index if not exists idx_session_fallback_tracks_session_enabled_queued
    on public.session_fallback_tracks(session_id, enabled, last_queued_at);

alter table public.session_fallback_tracks enable row level security;
do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'session_fallback_tracks'
          and policyname = 'deny_anon_session_fallback_tracks'
    ) then
        create policy deny_anon_session_fallback_tracks on public.session_fallback_tracks
            for all to anon, authenticated using (false) with check (false);
    end if;
end $$;

drop trigger if exists set_updated_at on public.session_fallback_tracks;
create trigger set_updated_at before update on public.session_fallback_tracks
    for each row execute function public.tg_set_updated_at();
