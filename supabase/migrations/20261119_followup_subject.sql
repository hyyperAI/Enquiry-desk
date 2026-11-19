-- Enquiry Desk: staff can change a follow-up's subject line.
-- Empty (null) means n8n uses "Re: <enquiry subject>", as before. Additive only.
alter table public.followups add column if not exists subject text;
