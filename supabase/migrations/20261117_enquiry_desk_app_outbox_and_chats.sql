-- Already applied to the "jetwing" Supabase project on 17 Nov 2026.
-- Kept here as a record. Additive only: no existing table was changed.

create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('reply','quotation','chat')),
  channel text not null default 'email' check (channel in ('email','whatsapp','facebook','instagram')),
  enquiry_id uuid references public.enquiries(id) on delete set null,
  email_message_id uuid references public.email_messages(id) on delete set null,
  quotation_id uuid references public.quotations(id) on delete set null,
  conversation_id uuid,
  to_address text, subject text, body text,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','cancelled')),
  last_error text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index outbox_queued_idx on public.outbox (created_at) where status = 'queued';
create index outbox_enquiry_idx on public.outbox (enquiry_id);
alter table public.outbox enable row level security;
create policy read_all on public.outbox for select to authenticated using (true);
create policy add_own on public.outbox for insert to authenticated with check (created_by = (select auth.uid()) and status = 'queued');
create policy cancel_own_queued on public.outbox for update to authenticated
  using (created_by = (select auth.uid()) and status = 'queued') with check (status in ('queued','cancelled'));

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp','facebook','instagram','email')),
  external_id text, customer_name text not null, contact_handle text,
  enquiry_id uuid references public.enquiries(id) on delete set null,
  labels text[] not null default '{}', facts jsonb not null default '{}'::jsonb, ai_suggestion text,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (channel, external_id)
);
create index conversations_last_idx on public.conversations (last_message_at desc);
alter table public.conversations enable row level security;
create policy read_all on public.conversations for select to authenticated using (true);
create policy edit on public.conversations for update to authenticated using (true) with check (true);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  body text not null,
  status text not null default 'received' check (status in ('received','queued','sent','failed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index conversation_messages_conv_idx on public.conversation_messages (conversation_id, created_at);
alter table public.conversation_messages enable row level security;
create policy read_all on public.conversation_messages for select to authenticated using (true);
create policy add_outbound on public.conversation_messages for insert to authenticated
  with check (direction = 'outbound' and status = 'queued' and created_by = (select auth.uid()));

alter table public.outbox add constraint outbox_conversation_fk foreign key (conversation_id) references public.conversations(id) on delete set null;

create or replace function public.jw_app_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger t_conversations before update on public.conversations for each row execute function public.jw_app_touch();

create or replace function public.jw_app_bump_conversation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         unread_count = case when new.direction = 'inbound' then unread_count + 1 else 0 end,
         ai_suggestion = case when new.direction = 'outbound' then null else ai_suggestion end
   where id = new.conversation_id;
  return new;
end $$;
revoke execute on function public.jw_app_bump_conversation() from public, anon, authenticated;
create trigger t_conversation_messages after insert on public.conversation_messages for each row execute function public.jw_app_bump_conversation();

alter publication supabase_realtime add table public.conversations, public.conversation_messages, public.outbox;
