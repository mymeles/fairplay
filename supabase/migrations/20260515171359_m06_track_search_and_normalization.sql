-- Milestone 6: track search and normalization.
--
-- Stores normalized Spotify track metadata so later queue milestones can
-- reference a durable internal track row without making Spotify the source
-- of truth. Search itself remains metadata-only and never creates queue
-- entries.

create table if not exists public.tracks (
    id                uuid primary key default uuid_generate_v4(),
    spotify_uri       text not null unique,
    spotify_track_id  text not null,
    title             text not null,
    artist            text not null,
    album             text,
    duration_ms       int not null,
    artwork_url       text,
    explicit          boolean not null default false,
    created_at        timestamptz not null default now(),
    constraint tracks_duration_positive check (duration_ms > 0),
    constraint tracks_spotify_uri_format check (spotify_uri ~ '^spotify:track:[A-Za-z0-9]+$'),
    constraint tracks_spotify_track_id_nonempty check (length(trim(spotify_track_id)) > 0),
    constraint tracks_title_nonempty check (length(trim(title)) > 0),
    constraint tracks_artist_nonempty check (length(trim(artist)) > 0)
);

create index if not exists idx_tracks_spotify_track_id on public.tracks(spotify_track_id);

alter table public.tracks enable row level security;
do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'tracks'
          and policyname = 'deny_anon_tracks'
    ) then
        create policy deny_anon_tracks on public.tracks
            for all to anon, authenticated using (false) with check (false);
    end if;
end $$;
