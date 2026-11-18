-- Enquiry Desk: "Ask AI to write a reply" button.
-- Additive only: one new table. No existing table, constraint, trigger or jw_* function changed.
-- The app inserts a row (status 'queued'). n8n claims it, runs workflow 04 Draft reply,
-- and sets 'done' (the new draft appears in email_messages) or 'failed' with last_error.

create table public.draft_requests (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  last_error text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Only one open request per enquiry, so a double click never makes two drafts.
create unique index draft_requests_one_open on public.draft_requests (enquiry_id) where status in ('queued','processing');
create index draft_requests_queued_idx on public.draft_requests (created_at) where status = 'queued';

alter table public.draft_requests enable row level security;
create policy read_all on public.draft_requests for select to authenticated using (true);
create policy add_own on public.draft_requests for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'queued');

alter publication supabase_realtime add table public.draft_requests;

-- To undo: alter publication supabase_realtime drop table public.draft_requests; drop table public.draft_requests;
