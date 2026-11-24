-- Call n8n the moment work is queued, instead of n8n polling on a schedule.
-- The URLs live only in the database, never in the front end.
--   outbox insert (status queued)   -> POST /webhook/outbox-sender      {outbox_id, kind}
--   knowledge_documents insert       -> POST /webhook/Knowledge-indexer  {document_id}
-- pg_net is async: the insert never waits on n8n, and a failed call does not
-- roll back the insert. n8n keeps a slow safety sweep for rows a call missed.
-- Additive only: new extension, two new functions, two new triggers.

create extension if not exists pg_net with schema extensions;

create or replace function public.jw_notify_outbox_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'queued' and coalesce(new.kind, '') <> 'chat' then
    perform net.http_post(
      url     := 'https://team-exopai675.app.n8n.cloud/webhook/outbox-sender',
      body    := jsonb_build_object('outbox_id', new.id, 'kind', new.kind),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return null;
end $$;

create or replace function public.jw_notify_knowledge_indexer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://team-exopai675.app.n8n.cloud/webhook/Knowledge-indexer',
    body    := jsonb_build_object('document_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return null;
end $$;

revoke all on function public.jw_notify_outbox_sender() from public, anon, authenticated;
revoke all on function public.jw_notify_knowledge_indexer() from public, anon, authenticated;

create trigger t_outbox_notify_n8n
  after insert on public.outbox
  for each row execute function public.jw_notify_outbox_sender();

create trigger t_knowledge_notify_n8n
  after insert on public.knowledge_documents
  for each row execute function public.jw_notify_knowledge_indexer();

-- To undo:
--   drop trigger t_outbox_notify_n8n on public.outbox;
--   drop trigger t_knowledge_notify_n8n on public.knowledge_documents;
--   drop function public.jw_notify_outbox_sender();
--   drop function public.jw_notify_knowledge_indexer();
