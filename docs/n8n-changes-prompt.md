# n8n workflow changes for Jetwing Enquiry Desk

These changes fix follow-up bugs and enable editable quote emails. DB migrations have already been applied. Back up each workflow before editing.

---

## 1. Workflow 08 — Process follow-ups (`EZM0fXUs8FgJkvPK`)

### 1a. Schedule: every hour → every 2 minutes
Change the "Every hour" schedule trigger from hourly to `minutesInterval: 2`. This makes "Send now" and moved follow-ups near-instant instead of up to 59 min late.

### 1b. Fix broken "Send follow-up" node
The "Send follow-up" node (Execute Workflow calling 05) has `body_html` referencing `$('Claude: write follow-up')` — that node is **disabled**. This causes every follow-up to get stuck in `processing`.

Fix: Change `body_html` in "Send follow-up" workflowInputs to read from `$('Save follow-up text').item.json.message_body`.

Also update "Save follow-up text" SQL to `returning id, status, message_body` (currently only returns `id, status`).

### 1c. Respect staff-typed text (skip AI when message_body already exists)
Currently the workflow always rewrites the follow-up text via AI, ignoring what staff typed.

Add an IF node **"Has staff text?"** between "Write follow-up?" (true output) and "Build Claude request":
- Condition: `$('Claim due follow-ups').item.json.message_body` is not empty/null
- **True** (staff text exists): route to a Code node **"Format staff text"** that HTML-escapes the plain text and converts `\n` to `<br>`, then outputs `{ message_body: htmlVersion }`. Connect this to "Auto send?" directly (skipping the AI entirely).
- **False** (no staff text): route to "Build Claude request" (existing AI path).

Format staff text code:
```javascript
const raw = $('Claim due follow-ups').item.json.message_body || '';
const esc = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const html = '<p>' + esc.split(/\n\n+/).map(p => p.replace(/\n/g, '<br>')).join('</p><p>') + '</p>';
return { json: { message_body: html } };
```

Connection changes:
- Remove: "Write follow-up?" → "Build Claude request"
- Add: "Write follow-up?" (true) → "Has staff text?"
- Add: "Has staff text?" (false) → "Build Claude request"
- Add: "Has staff text?" (true) → "Format staff text"
- Add: "Format staff text" → "Auto send?"

### 1d. Error handling
Add error handling so rows never stay stuck in `processing`. On any node failure after "Claim due follow-ups", route to a Postgres node **"Fail follow-up"** that runs:
```sql
select jw_finish_followup($1::uuid, false, $2);
```
With params: `[followup_id from Claim due follow-ups, error message]`.

The claim function already re-claims after 1h as a fallback, but this makes failures immediate.

### 1e. Unstick the currently stuck row
After deploying the workflow changes, run this once in Supabase SQL editor:
```sql
update followups set status = 'scheduled', due_at = now()
where status = 'processing' and updated_at < now() - interval '30 minutes';
```

---

## 2. Workflow 09 — API index knowledge (`8z48N73Mr45FZ9Hi`)

The app uploads `.md` and `.txt` files. On Windows, browsers set `file.type` to empty string for these, so the DB row has `mime_type = NULL`. Workflow 09 returns 422 rejecting NULL mime types.

Fix: In the node that validates the file type, also accept the file when the `storage_path` extension is `.pdf`, `.txt`, or `.md` — even if `mime_type` is NULL. This handles old rows and Windows uploads.

---

## 3. Workflow 13 — Knowledge indexer (`qxyMmRMYydIb9gVo`)

The claim condition only picks up rows where `updated_at <= created_at + 2s` or `updated_at < now()-10min`. This means a retry (staff sets status back to `processing`) waits up to 10 minutes.

Fix: Add to the claim condition: `OR (status = 'processing' AND error IS NULL AND updated_at > created_at + interval '2 seconds')`. This picks up retried rows immediately (error was cleared to NULL on retry).

---

## 4. Workflow 07 — API send quotation (`NbX8QlrOfBL6XOWq`)

Back up this workflow first.

### 4a. Custom email subject
In the "Send quotation email" node, change the subject from the hardcoded value to:
```
={{ $json.customer_block?.email_subject || 'Your Jetwing Travels quotation ' + $json.number }}
```
(Read `customer_block` from the quotation row — it's a jsonb column.)

### 4b. Custom email body
In the same node, change `body_html`:
- If `$json.customer_block?.email_body` exists, HTML-escape it and convert `\n` to `<br>` (same pattern as the follow-up format above).
- Otherwise use the current hardcoded HTML.

Expression:
```
={{ (() => { const b = $json.customer_block?.email_body; if (!b) return '<existing hardcoded HTML>'; const esc = b.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); return '<p>' + esc.split(/\n\n+/).map(p => p.replace(/\n/g,'<br>')).join('</p><p>') + '</p>'; })() }}
```

---

## 5. Workflow 05 — Send email (`QAL2OLkUm4aSjdEO`)

Check: Does 05 require a non-empty `gmail_thread_id`? For manual quotes (new customer, no prior email), `gmail_thread_id` will be empty. If 05 fails on empty thread, fix it to start a new Gmail thread when `gmail_thread_id` is empty (send as a new email, not a reply).

---

## 6. Legacy workflows to flag (DO NOT deactivate — just report)

Read each of these active workflows and report what they do, so the team can decide which to turn off:
- **"Jetwing Daily Follow-up"** — likely writes Gmail follow-up drafts at 9am, same job as 08
- **"AI Email Auto-Responder System"** — Gmail auto-responder, may duplicate 04's drafts
- **"Jetwing Contact Us Form"** — writes drafts into enquiries
- **"Jetwing RAG Draft Engine"** — writes drafts into enquiries
- **"My workflow"** — unknown

List what each one does (trigger, main actions, what tables/APIs it touches) and recommend which are safe to deactivate now that the new pipeline covers their job.
