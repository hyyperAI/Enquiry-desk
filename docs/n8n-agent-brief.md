# Brief for the n8n agent: make Send work, and make knowledge uploads index

You are working on the Jetwing Enquiry Desk. Read this whole brief, then look at the live n8n instance and the Supabase database yourself before building anything. **You decide** whether to edit existing workflows or create new ones. Explain that choice in your report.

Two jobs:
1. **Send button.** Replies and quotes queued by the app must actually be sent.
2. **Knowledge uploads.** Uploaded files must be indexed and go `live` (or `failed`).

Chats (WhatsApp / Facebook / Instagram) are **out of scope**. Leave any outbox row with `kind = 'chat'` untouched (do not claim it).

---

## How the system fits together (do not change this design)

```
React app ──writes/reads──► Supabase "jetwing" ◄──reads/writes── n8n ──► Gmail
```

- The app only talks to Supabase, with the public key and the user's session. It never holds n8n URLs, webhook secrets, Gmail tokens or the service-role key. Do not add any of these to the front end or to `VITE_` variables.
- n8n talks to Supabase with full access and does all sending.
- The hand-off is the `outbox` table. The app inserts a row with status `queued`. n8n claims it, sends it, and sets it to `sent` or `failed`.

**Environment**
- n8n: `https://exopai890.app.n8n.cloud`
- Supabase project: `jetwing` (project ref `dzygyxxwkgjyirsnhrdr`)
- Existing n8n credentials to reuse:
  - Postgres to the jetwing database: **"exop postgres"** (`QuOmykT0o2xGT5OI`). The name is misleading; it is the jetwing database.
  - Supabase API (storage): **"flag"** (`bnOGoD90bozQRp9X`)
  - Gmail: **"exopai"** (`8r3EnLHhGZ6HmYZU`)
  - Webhook header auth: **"voyage"** (`IkfA6OKH1wwZZtHu`). The `Authorization` header that protects webhooks 06, 07 and 09.
  - Voyage embeddings, OpenRouter, api2pdf: already wired into the existing workflows.

---

## Job 1: make the Send button work (the "outbox sender")

### Scenario: staff reply to an enquiry
1. **10:00:00.** Priya opens Mr Silva's enquiry, edits the AI draft and clicks **Send**. The app inserts into `outbox`: `kind='reply'`, `channel='email'`, `enquiry_id`, `email_message_id` (the AI draft row, may be null), `to_address`, `subject`, `body` (plain text, what Priya actually sent), `status='queued'`, `created_by`. The screen shows "Queued".
2. **10:00:05.** Priya can click **Undo** while the row is still `queued`. The app sets it to `cancelled`. **A cancelled row must never be sent.**
3. **About 10:01.** n8n claims all queued rows, moving them to `processing`. Use `for update skip locked` so two runs never take the same row, and always claim with `where status = 'queued'`.
4. For a `reply` row, n8n finds Mr Silva's Gmail thread and sends the email through the existing **05 Send email** sub-workflow.
5. **If it sent:** the row becomes `sent` with `processed_at = now()`. The app flips to "Sent" by itself (realtime is already on for `outbox`).
6. **If it failed** (for example a bad address): the row becomes `failed` with a short, readable `last_error`. The app shows it under Activity.

### Scenario: staff send a quote
The app inserts `kind='quotation'`, `channel='email'`, `enquiry_id`, `quotation_id`, `to_address`, `subject`, `created_by`. After claiming, n8n should use the existing quotation flow (**07 API send quotation**), which already:
- approves the quote,
- builds and stores the PDF,
- emails it in the thread,
- marks the quote sent,
- schedules a follow-up.

Then set the outbox row to `sent` or `failed` based on 07's result.

### Scenario: n8n stops halfway
A row can stay `processing`. Rows stuck for more than 15 minutes should go back to `queued`. This is safe for email because 05 refuses to send the same idempotency key twice. If 05 answers `error: 'duplicate'`, the earlier attempt already went out, so treat it as **sent**.

The `outbox` table has no "claimed at" column. Use `created_at` as an approximation, or propose a small additive column (ask first; see rules below).

### What already exists in n8n (reuse it)
- **05 Send email** (`QAL2OLkUm4aSjdEO`). Sub-workflow (Execute Workflow trigger).
  - Inputs: `idempotency_key, enquiry_id, to, subject, body_html, gmail_thread_id, in_reply_to, send_type, actor, message_row_id, attachment_path`.
  - Returns `{ ok, gmail_message_id, gmail_thread_id, email_message_id }` or `{ ok:false, error }`.
  - It respects `agent_settings.test_mode`: everything goes to `test_email` with a `[TEST to …]` subject.
  - It blocks duplicate sends using `send_log`, and calls `jw_record_send`. When `message_row_id` is the draft row, `jw_record_send` marks that draft `sent`.
  - Use a stable key such as `'outbox:' + outbox.id`.
- **06 API send reply** (`mosjWR6grgLvbsRO`). Webhook `POST /webhook/jetwing/send-reply`, body `{ draft_id, body_html, user_id }`.
  - It only works when an AI draft row exists and is still `draft`. Outbox replies can have no draft (`email_message_id` null), so 06 cannot cover every reply.
  - It shows the steps after a successful send: schedule follow-up (`jw_schedule_followup(enquiry_id, 'reply')`) and delete the leftover Gmail draft (`gmail_draft_id`).
- **07 API send quotation** (`NbX8QlrOfBL6XOWq`). Webhook `POST /webhook/jetwing/send-quotation`, header `Authorization`, body `{ quotation_id, user_id, to_email }`.
  - Responds 200 `{ok:true, pdf_path}`, 409 `{ok:false, error}` (cannot approve) or 502 `{ok:false, error}` (send failed; retry is safe).
  - Its idempotency key is `quote:<id>:v<version>`.
- **10 Schedule follow-up** (`jWaPLXmGBMQGjHtO`). Sub-workflow: `{ enquiry_id, source }`.
- **00 Error handler** (`hqVO1vmTRIel9W6p`).

### What a reply send needs
- Thread: `gmail_thread_id` of the latest `email_messages` row for the enquiry with status `received` or `sent`, ordered by `message_at` desc.
- `in_reply_to`: `rfc_message_id` of the latest inbound `email_messages` row for the enquiry.
- `body_html`: the outbox `body` is plain text. HTML-escape it and turn newlines into `<br>`.
- After success, the app shows `email_messages.body_text`. Set it to the outbox `body` on the recorded message row. Staff may have edited the draft.
- Existing behaviour to keep: enquiry status `new` becomes `quotation_sent` after the first reply (this is what the app calls "Answered").

### Helper functions already in the database (from the app)
These came with `docs/n8n-outbox-replies.workflow.json` (never run). You may use them, or replace them with your own flow.
- `jw_app_claim_reply_outbox(p_limit)`. Claims queued email replies and returns thread id, reply-to id and Gmail draft id.
- `jw_app_finish_reply_outbox(p_outbox, p_gmail_message_id, p_gmail_thread_id)`. Calls `jw_record_send` itself, updates `body_text`, moves New to Answered, and marks the row sent. **Do not combine it with 05**, which also records the send; you would get two records.
- `jw_app_fail_outbox(p_outbox, p_error)`. Marks the row failed.

### Known problem in 08 Process follow-ups (report it; do not fix without asking)
- It runs **hourly**. The app's "Send follow-up" sets `due_at = now()` and expects pickup within about 5 minutes.
- It always writes new text and **overwrites `followups.message_body`**, even when staff wrote it.
- Its "Send follow-up" node reads `$('Claude: write follow-up')`, which is **disabled**. Auto-sends will likely fail once `auto_followup_enabled` is on.

---

## Job 2: make knowledge uploads index

### Scenario
1. Staff upload `faq.pdf` on the Knowledge page.
2. The app puts it in the `knowledge` storage bucket and inserts a `knowledge_documents` row with `status='processing'`. The app shows "Reading…".
3. **Today nothing happens next.** 09 is a webhook and nobody calls it. The app must not call it (no n8n URLs in the front end).
4. Wanted: something calls 09 with `{ document_id }`. 09 extracts the text, chunks it, embeds it, calls `jw_replace_chunks`, and the document goes `live`.
5. If anything fails (unreadable PDF, empty text, too long, embedding error), the document must become `status='failed'` with a readable `error`. **Today 09 only does this for unsupported file types.** Other failures leave it stuck at "Reading…".

### What exists
- **09 API index knowledge** (`8z48N73Mr45FZ9Hi`). Webhook `POST /webhook/jetwing/index-knowledge`, header `Authorization`, body `{ document_id }`. Handles PDF, TXT and MD.

### Agreed approach (owner approved)
Add a **Supabase Database Webhook** on `INSERT` into `public.knowledge_documents` that calls 09's production URL with the `Authorization` header. A scheduled n8n sweep of rows still `processing` is an acceptable safety net if you think it is needed.

Also make every failure path in 09 set `failed` plus `error`.

The database webhook is a database change. Show the exact setup or SQL to the owner and get a yes before applying it.

---

## Rules
- **Never drop or alter** existing tables, columns, check constraints, triggers or `jw_*` functions. Additive changes only, and **ask the owner first** for any schema or security-policy change.
- Read a function before using it: `select pg_get_functiondef('public.<name>'::regproc);`
- Check status constraints: `select conrelid::regclass, pg_get_constraintdef(oid) from pg_constraint where contype='c' and connamespace='public'::regnamespace;`
- Existing workflows 00–11 are **live production**. Ask before editing any of them. If you create new workflows, build them **inactive**.
- `agent_settings.test_mode` is currently **true** (`test_email` = the owner's test inbox). Test only with it on. Ask the owner before activating anything that could reach real customers.
- Every send step needs an error path that marks the outbox row `failed` with a readable reason.
- Never put secrets in the front end, in commits or in chat.

## Testing (do this before saying it works)
1. Queue a reply from the app. Watch the row go `queued` → `processing` → `sent`. Check that the email arrived in the test inbox with a `[TEST to …]` subject.
2. Queue a reply and click Undo at once. Confirm the `cancelled` row is never sent.
3. Send a quote. Check that the quotation is `sent`, `pdf_path` is set, a follow-up exists and the outbox row is `sent`.
4. Force a failure (for example, a bad address with test mode off on a copy, or a broken quotation id). The row must be `failed` with a readable `last_error`.
5. Upload a small TXT file: `processing` → `live`. Upload a broken or empty PDF: `processing` → `failed` with an error.

## Report at the end
- Each workflow you created or changed: name, trigger, what it does, and whether it is new or edited (and why).
- Credentials or settings the owner must add.
- Any database changes, with the exact SQL.
- Test results, with outbox row ids and statuses.
- What is left, including the 08 follow-up problems above.
