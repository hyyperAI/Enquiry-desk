-- Fix: jw_schedule_followup, jw_finish_followup, jw_followup_decide and jw_followup_context
-- were set to search_path = '' and call public.jw_log, whose body inserts into the
-- unqualified "activity_logs". With an empty search path that fails with
-- 'relation "activity_logs" does not exist'. Pin jw_log to public. Body unchanged.
alter function public.jw_log(uuid, text, text, jsonb) set search_path = public;

-- To undo: alter function public.jw_log(uuid, text, text, jsonb) reset search_path;
