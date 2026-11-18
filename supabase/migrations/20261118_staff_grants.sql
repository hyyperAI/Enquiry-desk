-- Phase 0: grant missing DML privileges to authenticated role
-- RLS policies already restrict what staff can do; these grants just let the policies run.

-- followups: policies add_scheduled (INSERT) and edit (UPDATE) exist but no grant
grant insert, update on public.followups to authenticated;

-- contacts: policy edit (UPDATE) exists but no grant
grant update on public.contacts to authenticated;

-- knowledge_documents: policy edit (UPDATE) exists but no grant
grant update on public.knowledge_documents to authenticated;

-- travel_details: policy edit (UPDATE) exists but no grant; INSERT needed for Phase 4 upsert
grant insert, update on public.travel_details to authenticated;

-- enquiries: policy edit (UPDATE) exists but no grant — needed for status changes
grant update on public.enquiries to authenticated;

-- quotations: policies add (INSERT) and edit (UPDATE) exist but no grant
grant insert, update on public.quotations to authenticated;

-- Fix followups edit policy: allow staff to retry failed follow-ups.
-- Current USING only allows scheduled/due, so a failed row cannot be touched.
-- New: USING allows scheduled/due/failed; WITH CHECK allows scheduled/due/cancelled.
drop policy if exists "edit" on public.followups;
create policy "edit" on public.followups for update to authenticated
  using  (status in ('scheduled', 'due', 'failed'))
  with check (status in ('scheduled', 'due', 'cancelled'));
