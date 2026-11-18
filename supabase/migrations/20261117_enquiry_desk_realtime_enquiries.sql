-- Already applied to the "jetwing" Supabase project on 17 Nov 2026.
-- Kept here as a record. Lets the app hear about new and changed enquiries
-- so the Enquiries list and Home update without a refresh. No table was changed.

alter publication supabase_realtime add table public.enquiries;

-- To undo: alter publication supabase_realtime drop table public.enquiries;
