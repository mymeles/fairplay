-- Milestone 8: voting system.
--
-- votes — one row per (entry, guest); upserted when a guest changes their
-- mind. The aggregate counters (upvotes/downvotes/score) live on
-- queue_entries so the API never has to count() votes on the hot path.

create table if not exists public.votes (
    id          uuid primary key default uuid_generate_v4(),
    entry_id    uuid not null references public.queue_entries(id) on delete cascade,
    guest_id    uuid not null references public.session_guests(id) on delete cascade,
    value       int  not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint votes_value_check check (value in (-1, 1)),
    constraint votes_entry_guest_unique unique (entry_id, guest_id)
);

create index if not exists idx_votes_entry on public.votes(entry_id);
create index if not exists idx_votes_guest on public.votes(guest_id);

alter table public.votes enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'votes'
          and policyname = 'deny_anon_votes'
    ) then
        create policy deny_anon_votes on public.votes
            for all to anon, authenticated using (false) with check (false);
    end if;
end $$;

drop trigger if exists set_updated_at on public.votes;
create trigger set_updated_at before update on public.votes
    for each row execute function public.tg_set_updated_at();
