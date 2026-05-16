-- Milestone 10: lock window support.
--
-- queue_entries already has status='LOCKED' and locked_until from M07. This
-- partial index keeps the scheduler's expired-lock scan narrow without adding
-- any new durable state.

create index if not exists idx_queue_entries_session_locked_until
    on public.queue_entries(session_id, locked_until)
    where status = 'LOCKED';
