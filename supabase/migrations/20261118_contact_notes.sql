-- Add a notes field to contacts for staff to jot things about the customer.
alter table public.contacts add column if not exists notes text;
