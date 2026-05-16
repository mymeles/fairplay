-- Milestone 7: internal queue.
--
-- queue_entries — the app's source of truth for what's been suggested, locked,
-- queued to Spotify, playing, played, removed, or vetoed.
--
-- M07 only persists rows + computes an initial score. Real scoring (M09),
-- voting (M08), lock window (M10), runner (M12), host controls (M14), and
-- moderation (M16) all read/write this table later.

create table if not exists public.queue_entries (
    id                   uuid primary key default uuid_generate_v4(),
    session_id           uuid not null references public.party_sessions(id) on delete cascade,
    track_id             uuid not null references public.tracks(id) on delete restrict,
    added_by_guest_id    uuid references public.session_guests(id) on delete set null,
    status               text not null default 'PENDING',
    upvotes              int not null default 0,
    downvotes            int not null default 0,
    boost_credits        int not null default 0,
    score                numeric not null default 0,
    locked_until         timestamptz,
    host_pinned          boolean not null default false,
    spotify_queued_at    timestamptz,
    playing_at           timestamptz,
    played_at            timestamptz,
    removed_at           timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    constraint queue_entries_status_check check (
        status in (
            'PENDING',
            'LOCKED',
            'QUEUED_TO_SPOTIFY',
            'PLAYING',
            'PLAYED',
            'REMOVED',
            'VETOED'
        )
    ),
    constraint queue_entries_upvotes_nonneg check (upvotes >= 0),
    constraint queue_entries_downvotes_nonneg check (downvotes >= 0),
    constraint queue_entries_boost_nonneg check (boost_credits >= 0)
);

create index if not exists idx_queue_entries_session_status
    on public.queue_entries(session_id, status);
create index if not exists idx_queue_entries_session_score
    on public.queue_entries(session_id, score desc);
create index if not exists idx_queue_entries_session_track
    on public.queue_entries(session_id, track_id);
create index if not exists idx_queue_entries_guest
    on public.queue_entries(added_by_guest_id);

alter table public.queue_entries enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'queue_entries'
          and policyname = 'deny_anon_queue_entries'
    ) then
        create policy deny_anon_queue_entries on public.queue_entries
            for all to anon, authenticated using (false) with check (false);
    end if;
end $$;

drop trigger if exists set_updated_at on public.queue_entries;
create trigger set_updated_at before update on public.queue_entries
    for each row execute function public.tg_set_updated_at();
