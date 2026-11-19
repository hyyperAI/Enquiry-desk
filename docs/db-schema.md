# Database schema (Supabase project `jetwing`, ref dzygyxxwkgjyirsnhrdr)

Snapshot of the live `public` schema, taken 2026-11-19. Regenerate after migrations. NN = not null.
Every table has RLS on. Signed-in staff get access through the policies listed below; a table with no policies is closed to the app and can only be reached by the service role (n8n).

Realtime publication: enquiries, outbox, conversations, conversation_messages, draft_requests
Extensions: plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault, vector 0.8.2

## Tables used by the app

### enquiries
- columns: id uuid NN, contact_id uuid NN, gmail_thread_id text NN, subject text, category text NN, travel_type text NN, status text NN, closed_reason text, summary text, flags jsonb NN, followup_paused boolean NN, created_at, updated_at, closed_at
- fk: contact_id -> contacts.id
- policies: read_all [SELECT], edit [UPDATE]
- triggers: t_enquiries -> jw_touch

### contacts
- columns: id uuid NN, full_name text, email text NN, phone text, notes text, created_at, updated_at
- policies: read_all [SELECT], edit [UPDATE]
- triggers: t_contacts -> jw_touch

### travel_details
- columns: enquiry_id uuid NN (pk), destination text, check_in date, check_out date, adults int, children int, room_requirements text, budget_amount numeric(12,2), budget_currency text, hotel_preference text, special_requests text, updated_at
- fk: enquiry_id -> enquiries.id (cascade)
- policies: read_all [SELECT], add [INSERT], edit [UPDATE]
- triggers: t_travel -> jw_touch

### email_messages
- columns: id uuid NN, enquiry_id uuid, gmail_message_id text, gmail_thread_id text NN, rfc_message_id text, gmail_draft_id text, direction text NN, status text NN, sender text, sender_name text, recipients jsonb NN, subject text, body_text text, body_html text, message_at, ai_generated boolean NN, send_type text, classification jsonb, draft_meta jsonb, is_test boolean NN, created_at
- fk: enquiry_id -> enquiries.id (set null)
- policies: read_all [SELECT]

### attachments
- columns: id uuid NN, enquiry_id uuid, email_message_id uuid, file_name text NN, mime_type text, size_bytes bigint, storage_path text NN, created_at
- fk: enquiry_id -> enquiries.id (cascade); email_message_id -> email_messages.id (cascade)
- policies: read_all [SELECT]

### followups
- columns: id uuid NN, enquiry_id uuid NN, source text, due_at NN, scheduled_at NN, status text NN, message_body text, sent_at, cancelled_reason text, last_error text, created_at, updated_at
- fk: enquiry_id -> enquiries.id (cascade)
- policies: read_all [SELECT], add_scheduled [INSERT], edit [UPDATE]
- triggers: t_followups -> jw_touch

### quotations
- columns: id uuid NN, enquiry_id uuid NN, quotation_number text NN, version int NN, currency text NN, subtotal numeric(14,2) NN, taxes numeric(14,2) NN, total numeric(14,2) NN, valid_until date, customer_block jsonb NN, payment_details text, inclusions text, exclusions text, terms text, pdf_path text, status text NN, approved_by uuid, approved_at, sent_at, sent_to text, created_at, updated_at
- fk: enquiry_id -> enquiries.id; approved_by -> auth.users.id
- policies: read_all [SELECT], add [INSERT], edit [UPDATE]
- triggers: t_freeze_quotation -> jw_freeze_quotation; t_quotations -> jw_touch

### quotation_items
- columns: id uuid NN, quotation_id uuid NN, position int NN, description text NN, quantity numeric(12,2) NN, unit_price numeric(14,2) NN, total_price numeric(14,2) NN, is_bank_charge boolean NN
- fk: quotation_id -> quotations.id (cascade)
- policies: read_all [SELECT], edit_items [ALL]
- triggers: t_freeze_items -> jw_freeze_items

### outbox
- columns: id uuid NN, kind text NN, channel text NN, enquiry_id uuid, email_message_id uuid, quotation_id uuid, conversation_id uuid, to_address text, subject text, body text, status text NN, last_error text, created_by uuid NN, created_at, processed_at
- fk: enquiry_id -> enquiries.id; email_message_id -> email_messages.id; quotation_id -> quotations.id; conversation_id -> conversations.id (all set null); created_by -> auth.users.id
- policies: read_all [SELECT], add_own [INSERT], cancel_own_queued [UPDATE]

### draft_requests
- columns: id uuid NN, enquiry_id uuid NN, status text NN, last_error text, created_by uuid NN, created_at, processed_at
- fk: enquiry_id -> enquiries.id (cascade); created_by -> auth.users.id
- policies: read_all [SELECT], add_own [INSERT]

### conversations
- columns: id uuid NN, channel text NN, external_id text, customer_name text NN, contact_handle text, enquiry_id uuid, labels text[] NN, facts jsonb NN, ai_suggestion text, unread_count int NN, last_message_at NN, created_at, updated_at
- fk: enquiry_id -> enquiries.id (set null)
- policies: read_all [SELECT], edit [UPDATE]
- triggers: t_conversations -> jw_app_touch

### conversation_messages
- columns: id uuid NN, conversation_id uuid NN, direction text NN, body text NN, status text NN, created_by uuid, created_at
- fk: conversation_id -> conversations.id (cascade); created_by -> auth.users.id
- policies: read_all [SELECT], add_outbound [INSERT]
- triggers: t_conversation_messages -> jw_app_bump_conversation

### email_templates
- columns: id uuid NN, name text NN, category text NN, subject text NN, body text NN, variables text[] NN, is_active boolean NN, created_by uuid, created_at, updated_at
- policies: read_all [SELECT], add [INSERT], edit [UPDATE], remove [DELETE]
- triggers: email_templates_touch -> email_templates_touch

### knowledge_documents
- columns: id uuid NN, title text NN, doc_type text NN, storage_path text NN, mime_type text, status text NN, error text, created_at, updated_at
- policies: read_all [SELECT], add [INSERT], edit [UPDATE], remove [DELETE]
- triggers: t_knowledge -> jw_touch

### knowledge_chunks
- columns: id bigint NN, document_id uuid NN, chunk_index int NN, content text NN, embedding vector(1024) NN
- fk: document_id -> knowledge_documents.id (cascade)
- policies: none (service role only)

### agent_settings
- columns: id int NN, tone text NN, extra_instructions text NN, auto_faq_enabled boolean NN, faq_confidence numeric(3,2) NN, auto_followup_enabled boolean NN, followup_delay_days int NN, followup_send_hour int NN, timezone text NN, test_mode boolean NN, test_email text, alert_email text, updated_at
- policies: read_all [SELECT], edit [UPDATE]
- triggers: t_settings -> jw_touch

### activity_logs
- columns: id bigint NN, enquiry_id uuid, action text NN, actor text NN, details jsonb NN, created_at
- fk: enquiry_id -> enquiries.id (set null)
- policies: read_all [SELECT]

### notifications
- columns: id uuid NN, type text NN, enquiry_id uuid, read_at, created_at
- fk: enquiry_id -> enquiries.id (cascade)
- policies: read_all [SELECT], edit [UPDATE]

### send_log
- columns: idempotency_key text NN (pk), enquiry_id uuid, send_type text, gmail_message_id text, created_at, sent_at
- policies: none (service role only)

## Legacy tables (no policies, not used by the app)

### enquiries1
- columns: id, source, intent, guest_name, email, phone, country, property, inquiry_type, subject, message, booking_ref, reply_subject, reply_html, pinecone_hit, facts_used, status, gmail_message_id, thread_id, created_at, updated_at
- triggers: enquiries_set_updated_at -> set_enquiries_updated_at

### leads
- columns: id, name, email NN, first_message, created_at

### emails
- columns: id, lead_email, status, email_history jsonb, next_follow_up date, email_type, email_sent, updated_at
- fk: lead_email -> leads.email (cascade)

### chat_messages
- columns: id, session_id, vapi_chat_id, user_message, bot_reply, created_at

### voice_calls
- columns: id, vapi_call_id, ended_reason, transcript, summary, recording_url, raw jsonb, created_at

## Functions (public, excluding pgvector built-ins)

### App RPCs (called by the web app)
- jw_app_manual_enquiry(p_email, p_name, p_subject) -> uuid [security definer]
- jw_schedule_followup(p_enquiry, p_source) -> uuid

### Outbox / sending (called by n8n)
- jw_app_claim_reply_outbox(p_limit) -> table(outbox_id, enquiry_id, to_address, subject, body, gmail_thread_id, reply_to_message_id, gmail_draft_id)
- jw_app_finish_reply_outbox(p_outbox, p_gmail_message_id, p_gmail_thread_id) -> uuid
- jw_app_fail_outbox(p_outbox, p_error) -> void
- jw_record_send(p jsonb) -> uuid
- jw_mark_quotation_sent(p_id, p_gmail_message_id) -> void
- jw_approve_quotation(p_id, p_user, p_to, p_seen_at) -> jsonb

### Inbound mail and drafting (called by n8n)
- jw_insert_inbound(p jsonb) -> table(message_id, is_new, existing_enquiry_id)
- jw_apply_classification(p_message_id, r jsonb) -> jsonb
- jw_enquiry_for_thread(p_thread) -> uuid
- jw_draft_context(p_enquiry, p_inbound) -> jsonb
- jw_save_draft(p jsonb) -> uuid

### Follow-ups (called by n8n)
- jw_claim_due_followups() -> table(followup_id, enquiry_id, gmail_thread_id, scheduled_at)
- jw_followup_context(p_enquiry) -> jsonb
- jw_followup_decide(p_id, p_gmail jsonb) -> jsonb [security definer]
- jw_finish_followup(p_id, p_ok, p_error) -> void

### Knowledge base (called by n8n)
- jw_replace_chunks(p_document, p_chunks jsonb, p_embeddings jsonb) -> int
- jw_match_knowledge(p_embedding vector, p_count, p_min_similarity) -> table(chunk_id, document_id, title, doc_type, content, similarity)

### Helpers
- jw_log(p_enquiry, p_action, p_actor, p_details) -> void
- jw_nonneg_int(t), jw_nonneg_num(t), jw_try_date(t), jw_try_ts(t)

### Trigger functions
- jw_touch, jw_app_touch, jw_app_bump_conversation [security definer], jw_freeze_quotation, jw_freeze_items, email_templates_touch, set_enquiries_updated_at

### Legacy functions
- due_follow_ups(), get_lead_history(p_email), log_exchange(...), record_follow_up(p_email, p_subject, p_body)
