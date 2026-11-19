# Brief for the n8n agent: the "Ask AI to write a reply" button

Read this whole brief, then check the live n8n instance and the Supabase database yourself before building. **You decide** whether to create a new workflow or extend one. Explain the choice in your report.

## Why
Workflow 01 calls **04 Draft reply** only when a new email comes in, so 3 of 5 open enquiries have no AI draft and staff had no way to get one.

The app now has an **"Ask AI to write a reply"** button on the Enquiry page. It puts a request in a new table. n8n must pick the request up, write the draft with the existing 04, and report back.

## Environment
- n8n: `https://team-exop-5453.app.n8n.cloud`
- Supabase project `jetwing` (ref `dzygyxxwkgjyirsnhrdr`)
- Credentials to reuse: Postgres **"exop postgres"** (`QuOmykT0o2xGT5OI`), which connects to the jetwing database despite its name.

## The new table (already created by the app; do not alter it)
```sql
public.draft_requests (
  id uuid primary key,
  enquiry_id uuid not null references enquiries(id),
  status text  -- 'queued' | 'processing' | 'done' | 'failed'
  last_error text,
  created_by uuid,
  created_at timestamptz,
  processed_at timestamptz
)
-- unique index: only ONE row per enquiry may be 'queued' or 'processing' at a time
```
- Staff can only insert `queued` rows and read rows. They cannot update them.
- Realtime is on, so the app updates by itself when n8n changes `status`.

## Scenario
1. **10:00.** Priya opens Mr Silva's enquiry. There is no AI draft, so she clicks **Ask AI to write a reply**. A row is inserted with `status='queued'`, and the page shows "The AI is writing a reply…".
2. **About 10:01.** n8n claims the queued requests (`for update skip locked`; set them to `processing` and use `processed_at` as the claim time, the same pattern as workflow 12).
3. For each request, n8n finds the enquiry's **latest inbound** `email_messages` row, then calls **04 Draft reply** with `{ enquiry_id, inbound_message_id }`.
   - 04 writes the reply from the conversation and the live knowledge base.
   - 04 creates the Gmail draft and saves it with `jw_save_draft`, so a `status='draft'` outbound `email_messages` row appears.
4. **Success:** set `status='done'`, `processed_at=now()`. The app reloads, and the draft appears in the reply box.
5. **Failure:** set `status='failed'`, `processed_at=now()`, and a short, readable `last_error`. The app shows it with a **Try again** button. Examples:
   - "This enquiry has no customer email to reply to." (no inbound message)
   - "The AI did not return a usable reply. Try again."
   - "Reading the knowledge base failed. Try again in a minute."

## Things to watch
- **No inbound email.** Some enquiries (for example from the contact form) may have no inbound `email_messages` row, and 04's `jw_draft_context(p_enquiry, p_inbound)` needs one. Fail those with a clear message, or adapt the context. Read `jw_draft_context` first:
  `select pg_get_functiondef('public.jw_draft_context'::regproc);`
- **Auto-send must never happen for a requested draft.** 04 can auto-send an FAQ answer when `agent_settings.auto_faq_enabled` is on (currently **off**). When staff ask for a draft, they expect a draft, not a sent email. Make sure this path cannot send. For example, pass a flag 04 respects, or check the setting before calling 04. Editing 04 is a change to a live workflow, so ask the owner first.
- **An open draft already exists.** If the enquiry already has an outbound row with `status='draft'`, mark the request `done` without writing another draft. The app only shows the button when there is no draft, but two staff can race.
- **Stuck rows.** Requests stuck in `processing` for 15+ minutes should go back to `queued`, or to `failed` with "Stopped while writing. Try again.".
- **Speed.** Run every 1 minute. Staff are watching the screen.
- **Errors.** Every step that can fail (04, Voyage, OpenRouter, Gmail draft) needs an error path that sets the request `failed`, never leaving it stuck at `processing`.

## Rules
- Do not drop or alter existing tables, columns, constraints, triggers or `jw_*` functions. Ask the owner before any schema change.
- Workflows 00–13 are live. Ask before editing any of them. Build new workflows inactive. The owner publishes them.
- `agent_settings.test_mode` is on. A draft never sends, but keep it on anyway.

## Testing
1. On an enquiry with no draft, click **Ask AI to write a reply**. The request should go `queued` → `processing` → `done`, and the draft should appear in the app within about 2 minutes, plus in Gmail drafts.
2. On an enquiry with no inbound email, the request should end `failed` with a readable message.
3. Click twice quickly. Only one request is created, and the app shows "already writing".
4. Confirm nothing was sent (check `send_log` and `outbox`).

Check with:
```sql
select id, enquiry_id, status, last_error, created_at, processed_at from draft_requests order by created_at desc limit 10;
```

## Report
- Workflow name, trigger and what it does.
- Any change to 04, and why.
- Test results with request ids.
- What is left.
