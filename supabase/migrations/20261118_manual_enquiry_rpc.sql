-- RPC for creating a manual enquiry when staff sends a quote to someone not in the system.
-- Finds or creates the contact, then inserts an enquiry with sensible defaults.
-- security definer so authenticated role can insert into contacts + enquiries without broad INSERT grants.
set search_path = '';

create or replace function public.jw_app_manual_enquiry(
  p_email text,
  p_name  text default '',
  p_subject text default 'Manual quotation'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_contact_id uuid;
  v_enquiry_id uuid;
begin
  -- Find existing contact by email (case-insensitive)
  select id into v_contact_id
    from public.contacts
   where lower(email) = lower(trim(p_email))
   limit 1;

  -- Create contact if not found
  if v_contact_id is null then
    insert into public.contacts (full_name, email)
    values (nullif(trim(p_name), ''), lower(trim(p_email)))
    returning id into v_contact_id;
  end if;

  -- Create a lightweight enquiry (no gmail thread — use a placeholder)
  insert into public.enquiries (
    contact_id, gmail_thread_id, subject, category, travel_type, status, flags
  ) values (
    v_contact_id,
    'manual_' || gen_random_uuid()::text,
    coalesce(nullif(trim(p_subject), ''), 'Manual quotation'),
    'general',
    'unknown',
    'research_in_progress',
    '{"source":"manual_quote"}'::jsonb
  ) returning id into v_enquiry_id;

  return v_enquiry_id;
end;
$$;

grant execute on function public.jw_app_manual_enquiry(text, text, text) to authenticated;
