# n8n: what has to exist for the app's Send buttons to work

The app never sends anything itself. It writes to Supabase, and n8n does the sending.

## Already works with your current workflows
- **Follow-ups.** "Send Follow-up" sets `followups.due_at` to now. Your follow-up workflow (`jw_claim_due_followups`) picks it up on its next run.
- **Knowledge files.** Upload puts the file in the `knowledge` bucket and adds a `knowledge_documents` row with status `processing`. Your knowledge workflow must read it, call `jw_replace_chunks`, and set it `live` (or `failed` with an error).

## Ready to import: Outbox sender for email replies
`docs/n8n-outbox-replies.workflow.json` sends the app's email replies. It has not been run in n8n yet.

1. In n8n: Workflows → Import from file → pick that file.
2. Open the three Postgres nodes and pick a credential that connects to the jetwing database as `postgres` (the functions are not open to normal users).
3. Open the two Gmail nodes and pick the Jetwing Gmail credential.
4. Queue one reply in the app to an address you own, press "Execute workflow" once, and check the mail arrived in the same Gmail thread.
5. Turn the workflow on. It runs every minute.

What it does: claims queued replies (`jw_app_claim_reply_outbox`), replies inside the customer's Gmail thread, then `jw_app_finish_reply_outbox` records the mail with `jw_record_send`, moves the enquiry from New to Answered and marks the outbox row `sent`. The leftover AI draft in Gmail is deleted. If Gmail fails, `jw_app_fail_outbox` marks the row `failed` with the reason, and the app shows it under Activity.

Known gap: if n8n stops halfway, a row can stay `processing`. It is not retried automatically, to avoid sending the same reply twice. Set it back to `queued` by hand if the mail did not go out.

Quotes and chats are not covered by this file. They still need the steps below.

## Still needed: quotes and chats (and the general shape)
Run every 1 to 2 minutes, using the service role key.

1. Claim work:
   ```sql
   update outbox set status = 'processing'
   where id in (select id from outbox where status = 'queued' order by created_at limit 20 for update skip locked)
   returning *;
   ```
2. For each row, by `kind`:
   - **reply** (email): send `body` to `to_address` with `subject` in the enquiry's Gmail thread (thread id from `email_messages` for `enquiry_id`). If `email_message_id` points at the AI draft, you can update that Gmail draft with `body` and send it. Then record it the way your workflows already do (`jw_record_send`), and mark the draft row `sent`.
   - **quotation**: call `jw_approve_quotation(quotation_id, created_by, to_address, null)`, build the PDF from the returned quotation + items, upload to the `quotations` bucket, send by Gmail, then `jw_mark_quotation_sent(quotation_id, gmail_message_id)` and `jw_schedule_followup(enquiry_id, 'quotation')`.
   - **chat**: send `body` to `to_address` through the WhatsApp / Facebook / Instagram API for `channel`, then set the matching `conversation_messages` row (same conversation, status `queued`, same body) to `sent`.
3. Finish: `update outbox set status = 'sent', processed_at = now() where id = $1` (or `status = 'failed', last_error = $2`).

## Chats inbox (WhatsApp, Facebook, Instagram)
For each incoming message from those apps:
1. Upsert `conversations` on `(channel, external_id)` with `customer_name`, `contact_handle`, and optionally `facts` (e.g. `{"Place":"Kandy","Dates":"Dec"}`), `ai_suggestion`, `enquiry_id`.
2. Insert `conversation_messages` with `direction = 'inbound'`, `status = 'received'`. A trigger bumps the unread count and last message time.
