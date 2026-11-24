-- The n8n webhooks accept GET only (owner's choice). Same triggers, now GET with the id
-- in the query string: ?outbox_id=..&kind=..  and  ?document_id=..
create or replace function public.jw_notify_outbox_sender()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'queued' and coalesce(new.kind, '') <> 'chat' then
    perform net.http_get(
      url    := 'https://team-exopai675.app.n8n.cloud/webhook/outbox-sender',
      params := jsonb_build_object('outbox_id', new.id, 'kind', new.kind)
    );
  end if;
  return null;
end $$;

create or replace function public.jw_notify_knowledge_indexer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_get(
    url    := 'https://team-exopai675.app.n8n.cloud/webhook/Knowledge-indexer',
    params := jsonb_build_object('document_id', new.id)
  );
  return null;
end $$;
