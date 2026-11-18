-- Enquiry Desk: let staff schedule follow-ups without a quote, and store email templates.
-- Additive only. n8n tables, columns and constraints are unchanged.

-- 1. Staff may add a follow-up, only as 'scheduled' (n8n's follow-up workflow sends it).
create policy add_scheduled on public.followups
  for insert to authenticated
  with check (status = 'scheduled');

-- 2. Email templates for staff replies and follow-ups.
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in (
    'initial_response', 'pricing', 'service_info', 'meeting_invite', 'more_info',
    'followup_1', 'followup_2', 'followup_final', 'thank_you', 'closure')),
  subject text not null default '',
  body text not null default '',
  variables text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
create policy read_all on public.email_templates for select to authenticated using (true);
create policy add on public.email_templates for insert to authenticated with check (true);
create policy edit on public.email_templates for update to authenticated using (true) with check (true);
create policy remove on public.email_templates for delete to authenticated using (true);

create or replace function public.email_templates_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger email_templates_touch before update on public.email_templates
  for each row execute function public.email_templates_touch();
