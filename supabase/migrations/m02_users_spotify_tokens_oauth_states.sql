-- Milestone 2: host identity, encrypted Spotify tokens, and short-lived OAuth state.
-- Applied to project zgublzgoejdzexwpicvb via mcp__supabase__apply_migration.

create extension if not exists "uuid-ossp";

create table if not exists public.users (
    id              uuid primary key default uuid_generate_v4(),
    email           text unique,
    display_name    text,
    spotify_user_id text unique,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_users_spotify_user_id on public.users(spotify_user_id);
alter table public.users enable row level security;

create table if not exists public.spotify_tokens (
    id                       uuid primary key default uuid_generate_v4(),
    user_id                  uuid not null references public.users(id) on delete cascade,
    encrypted_refresh_token  text not null,
    access_token_hash        text,
    expires_at               timestamptz not null,
    scopes                   text[] not null,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now(),
    unique(user_id)
);

create index if not exists idx_spotify_tokens_user_id on public.spotify_tokens(user_id);
create index if not exists idx_spotify_tokens_expires_at on public.spotify_tokens(expires_at);
alter table public.spotify_tokens enable row level security;

create table if not exists public.oauth_states (
    state         text primary key,
    code_verifier text not null,
    redirect_to   text,
    created_at    timestamptz not null default now(),
    expires_at    timestamptz not null
);

create index if not exists idx_oauth_states_expires_at on public.oauth_states(expires_at);
alter table public.oauth_states enable row level security;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.users;
create trigger set_updated_at before update on public.users
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.spotify_tokens;
create trigger set_updated_at before update on public.spotify_tokens
  for each row execute function public.tg_set_updated_at();

-- Explicit deny policies for non-service-role clients. The service-role
-- key (used by NestJS and the spotify-callback Edge Function) bypasses
-- RLS by design, so production access still works.
create policy if not exists deny_anon_users on public.users
  for all to anon, authenticated using (false) with check (false);
create policy if not exists deny_anon_spotify_tokens on public.spotify_tokens
  for all to anon, authenticated using (false) with check (false);
create policy if not exists deny_anon_oauth_states on public.oauth_states
  for all to anon, authenticated using (false) with check (false);
