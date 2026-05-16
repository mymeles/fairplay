-- Milestone 15: session token economy ledger.
--
-- guest_wallets already exists from M04. This table makes every free token
-- grant/spend auditable while queue_entries and guest_wallets keep the hot
-- balance/ranking state.

create table if not exists public.token_ledger (
    id          uuid primary key default uuid_generate_v4(),
    session_id  uuid not null references public.party_sessions(id) on delete cascade,
    guest_id    uuid not null references public.session_guests(id) on delete cascade,
    entry_id    uuid references public.queue_entries(id) on delete set null,
    token_type  text not null,
    amount      int not null,
    reason      text not null,
    created_at  timestamptz not null default now(),
    constraint token_ledger_token_type_check check (token_type in ('BOOST', 'CHALLENGE')),
    constraint token_ledger_reason_check check (
        reason in ('JOIN_GRANT', 'HOST_GRANT', 'BOOST_SPEND', 'CHALLENGE_LOCK')
    ),
    constraint token_ledger_amount_nonzero check (amount <> 0),
    constraint token_ledger_amount_direction_check check (
        (reason in ('JOIN_GRANT', 'HOST_GRANT') and amount > 0)
        or (reason in ('BOOST_SPEND', 'CHALLENGE_LOCK') and amount < 0)
    ),
    constraint token_ledger_reason_token_type_check check (
        (reason = 'BOOST_SPEND' and token_type = 'BOOST')
        or (reason = 'CHALLENGE_LOCK' and token_type = 'CHALLENGE')
        or reason in ('JOIN_GRANT', 'HOST_GRANT')
    )
);

-- Natural idempotency for entry-scoped spends: the same guest cannot spend
-- the same token type for the same action on the same queue entry twice.
create unique index if not exists ux_token_ledger_entry_spend
    on public.token_ledger(session_id, guest_id, entry_id, token_type, reason);

create index if not exists idx_token_ledger_guest
    on public.token_ledger(guest_id, created_at desc);

create index if not exists idx_token_ledger_session
    on public.token_ledger(session_id, created_at desc);

alter table public.token_ledger enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'token_ledger'
          and policyname = 'deny_anon_token_ledger'
    ) then
        create policy deny_anon_token_ledger on public.token_ledger
            for all to anon, authenticated using (false) with check (false);
    end if;
end $$;
