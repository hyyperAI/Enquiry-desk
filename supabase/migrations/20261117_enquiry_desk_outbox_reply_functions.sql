-- Already applied to the "jetwing" Supabase project on 17 Nov 2026.
-- Kept here as a record. Helpers for the n8n "Outbox sender" workflow (email replies).
-- Additive: no table changed. Only the service role (n8n) may call them.

-- 1. Claim queued email replies. Returns what n8n needs to send each one.
create or replace function public.jw_app_claim_reply_outbox(p_limit integer default 10)
returns table(outbox_id uuid, enquiry_id uuid, to_address text, subject text, body text,
              gmail_thread_id text, reply_to_message_id text, gmail_draft_id text)
language sql set search_path = public as $$
  with claimed as (
    update outbox o set status = 'processing'
    where o.id in (select q.id from outbox q where q.status = 'queued' and q.kind = 'reply' and q.channel = 'email'
                   order by q.created_at limit p_limit for update skip locked)
    returning o.*
  )
  select c.id, c.enquiry_id, c.to_address, c.subject, c.body, e.gmail_thread_id,
         (select m.gmail_message_id from email_messages m
           where m.enquiry_id = c.enquiry_id and m.direction = 'inbound' and m.gmail_message_id is not null
           order by coalesce(m.message_at, m.created_at) desc limit 1),
         (select d.gmail_draft_id from email_messages d where d.id = c.email_message_id and d.status = 'draft')
  from claimed c left join enquiries e on e.id = c.enquiry_id
  order by c.created_at;
$$;

-- 2. After Gmail sent it: record the mail (jw_record_send), keep the text staff actually sent,
--    move the enquiry from New to Answered, and mark the outbox row sent.
create or replace function public.jw_app_finish_reply_outbox(p_outbox uuid, p_gmail_message_id text, p_gmail_thread_id text)
returns uuid language plpgsql set search_path = public as $$
declare o outbox; v_draft uuid; v_msg uuid; v_thread text;
begin
  select * into o from outbox where id = p_outbox and status = 'processing' for update;
  if not found then raise exception 'Outbox row % is not being processed', p_outbox; end if;
  -- Reuse the AI draft row only if it is still a draft.
  select id into v_draft from email_messages where id = o.email_message_id and status = 'draft';
  select gmail_thread_id into v_thread from enquiries where id = o.enquiry_id;
  v_msg := jw_record_send(jsonb_build_object(
    'message_row_id', v_draft, 'enquiry_id', o.enquiry_id,
    'gmail_message_id', p_gmail_message_id,
    'gmail_thread_id', coalesce(nullif(p_gmail_thread_id, ''), v_thread),
    'subject', o.subject, 'to', o.to_address,
    'body_html', replace(replace(replace(replace(coalesce(o.body, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\n', '<br>'),
    'send_type', 'manual', 'actor', 'staff', 'is_test', false));
  -- The app shows body_text, and staff may have edited the AI draft before sending.
  update email_messages set body_text = o.body where id = v_msg;
  -- We have answered: New -> Answered. Other statuses are left alone.
  update enquiries set status = 'quotation_sent' where id = o.enquiry_id and status = 'new';
  update outbox set status = 'sent', processed_at = now(), last_error = null where id = p_outbox;
  return v_msg;
end $$;

-- 3. If sending failed: mark it failed with the reason. The app shows it in Activity.
create or replace function public.jw_app_fail_outbox(p_outbox uuid, p_error text)
returns void language sql set search_path = public as $$
  update outbox set status = 'failed', processed_at = now(), last_error = left(coalesce(nullif(p_error, ''), 'Unknown error'), 500)
  where id = p_outbox and status = 'processing';
$$;

revoke execute on function public.jw_app_claim_reply_outbox(integer) from public, anon, authenticated;
revoke execute on function public.jw_app_finish_reply_outbox(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.jw_app_fail_outbox(uuid, text) from public, anon, authenticated;
grant execute on function public.jw_app_claim_reply_outbox(integer) to service_role;
grant execute on function public.jw_app_finish_reply_outbox(uuid, text, text) to service_role;
grant execute on function public.jw_app_fail_outbox(uuid, text) to service_role;
