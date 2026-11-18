# Enquiry Desk: senior's feedback round 1, implementation plan

> Written for the executing agent (Claude Opus 4.6). Read this whole file before touching code.
> Project: `E:\usman exop\projects\enquiry-desk\enquiry-desk` (React 18 + Vite + Tailwind + React Router 6, no git repo).
> Backend: Supabase project **jetwing** (`dzygyxxwkgjyirsnhrdr`), n8n cloud (`exopai890.app.n8n.cloud`, use the `959fef1d…` n8n MCP tools; the `n8n-mcp` server fails DNS).
> All DB access in the app goes through `src/lib/api.js`. The app never sends mail itself: it writes rows (outbox, followups, draft_requests) and n8n does the sending.

## Context

The senior tested the app and reported 11 problems. I checked them against the code, the live DB and the n8n workflows. Several "bugs" share one root cause, so **fix in the order below**: the first two phases unblock most of the complaints.

Root causes confirmed on the live system:

| Complaint | Root cause (verified) |
|---|---|
| Follow-up "permission denied" | Role `authenticated` has only `SELECT` on `public.followups` (RLS policies exist, but no table GRANT). Every Send now / Move / Cancel / Schedule fails. Same for `contacts` (SELECT only), and `knowledge_documents` has no `UPDATE` (so the Live toggle fails too). |
| Moved follow-up didn't go at the set time | (a) The move itself failed (grant above). (b) n8n **08 Process follow-ups** runs **every hour**, so even a correct due time can be 59 minutes late. |
| "Follow up now" not working | (a) Grant. (b) In 08, node **Send follow-up** reads `$('Claude: write follow-up')`, which is **disabled** (OpenRouter replaced it), so the expression throws and the row is stuck in `processing` (one row is stuck now, due 2026-11-17 08:50 UTC). (c) 08 always has the AI rewrite `message_body`, so staff-typed text is ignored. |
| Knowledge base: every upload fails | The app inserts `mime_type: file.type \|\| null`. Windows browsers give `''` for `.md` (often for `.txt` too), so `mime_type` is NULL. n8n **09 API index knowledge** answers 422, and **13 Knowledge indexer** marks the file `failed` ("Only PDF, TXT and MD files…"). Both DB rows are `.md` with NULL mime. |
| Quotes only in USD | `api.js sendQuote` hardcodes `currency: 'USD'`; the UI labels say US$. The DB check already allows `USD`/`LKR`, and 07's PDF already maps LKR. |
| Static quote message | n8n **07 API send quotation**, node **Send quotation email**: the `body_html` is a hardcoded string. The app has no field for it. |
| No quote history | No UI. Data exists: `quotations` (enquiry_id, number, version, currency, total, sent_at, pdf_path) → `enquiries.contact_id` → `contacts`. |
| Can't edit person details | No UI, plus no UPDATE grant on `contacts`. `contacts` has only `full_name, email, phone` (no notes). |
| Can't change inquiry status | `setEnquiryStatus` exists in `api.js` but is only used from the list page. The enquiry header has no control. |
| `{{company}}` template variable | `api.js` `TEMPLATE_VARIABLES` and `getEnquiry().vars.company = ''`, plus any saved templates in `email_templates`. |
| Page "shift" between Reply / Quote / Follow-up | These are 3 separate top-level routes (`/enquiries/:id`, `/quotes?enquiry=`, `/follow-ups?enquiry=`). Each fully unmounts and remounts, refetches the header, and briefly renders a different header (`PageHeader` "Send a quote" / "Loading customer…") before `EnquiryHeader` appears. |

User decisions (already made, do not re-ask):
- Currencies: **USD and LKR only**. No DB constraint change.
- Language: **English only**. No i18n.
- Quote history shows **amount (with currency), PDF link, and sent date** (plus number/version for clarity). No open/click tracking.
- Quote to an unknown email: **auto-create a contact and a "manual" enquiry** so the PDF, history and follow-ups keep working.

Write every migration as a new file in `supabase/migrations/` (name `20261118_<what>.sql`) **and** apply it with the Supabase MCP `apply_migration`. Keep the existing style: additive, commented, `set search_path = ''` on functions.

---

## Phase 0: DB grants (unblocks follow-ups, contact edit, KB toggle)

Migration `20261118_staff_grants.sql`:
```sql
grant insert, update on public.followups to authenticated;          -- RLS add_scheduled / edit already limit what staff can do
grant update on public.contacts to authenticated;                    -- RLS "edit" policy already exists
grant update on public.knowledge_documents to authenticated;         -- RLS "edit" policy already exists
```
Before applying, run this query and add any missing grant that a policy clearly expects: `select table_name, privilege_type from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name in ('enquiries','travel_details','contacts','followups','knowledge_documents','quotations','quotation_items','outbox','email_templates');`. `travel_details` has an `edit` policy; if UPDATE is not granted, grant it, because Phase 4 edits trip facts.

Also unstick the stuck row once: `update followups set status='scheduled', due_at=now() where status='processing' and updated_at < now() - interval '30 minutes';` (run it only after Phase 1 is deployed).

Follow-up RLS also needs a fix: the `edit` policy's USING only allows `scheduled`/`due`. That means staff cannot retry a `failed` follow-up. Replace the policy so USING allows `('scheduled','due','failed')` and WITH CHECK allows `('scheduled','due','cancelled')`. That gives "retry" = set the row back to `scheduled`.

Known constraint: `followups` has a partial unique index (one active follow-up per enquiry, statuses scheduled/processing/due/sent; see `jw_schedule_followup`'s `on conflict`). So `scheduleFollowUp` fails with `23505` when the enquiry already has one. In `api.js scheduleFollowUp`, catch `23505` and throw a readable message ("This customer already has a follow-up. Move or send that one instead."). Do not drop the index: n8n depends on it.

## Phase 1: Follow-up workflow (n8n 08 `EZM0fXUs8FgJkvPK`)

Use `get_workflow_details`, then `update_workflow`. Keep a JSON backup of the current version in `docs/backups/08-before.json` first.
1. **Every hour → every 2 minutes** (`Every hour` schedule trigger: `minutesInterval: 2`). This fixes "moved follow-up not on time" and makes Send now near-instant. The app copy "goes out within a few minutes" then becomes true.
2. **Send follow-up** `body_html`: replace `$('Claude: write follow-up')…` with `$('Save follow-up text')`'s source text. Simplest: make **Save follow-up text** `returning id, status, message_body`, and use `$('Save follow-up text').item.json.message_body`.
3. **Respect staff text.** Before **Build Claude request**, add an IF: when the follow-up row already has a non-empty `message_body` (fetch it in `Decide`'s context or with a small Postgres select), skip the AI and go straight to **Auto send?**. Staff text is plain text from a textarea, so convert newlines to `<br>` and HTML-escape it (same expression as 12's `Send via 05`).
4. Check `jw_followup_decide`: when staff pressed "Send now", the row has `due_at≈now()`. Confirm `action` is `send` (not `hold`) for staff-triggered sends even when the auto follow-up switch is off. If it returns `hold`, add a `source='staff'` / staff-set-body bypass in that function (new migration).
5. Make sure a thrown error ends in `jw_finish_followup(id, false, error)` (add an error branch), so rows never stay `processing`. The claim function already re-claims after 1h; that is acceptable as a fallback.

App side (`src/pages/FollowUps.jsx`, `api.js`): `moveFollowUp` should filter `.in('status',['scheduled','due','failed'])` and set `status:'scheduled', last_error:null`. Add a "Retry" button on failed rows that calls the same thing with `due_at = now`.

## Phase 2: Knowledge base upload

`src/lib/api.js uploadKnowledge`: derive the mime type from the extension when `file.type` is empty: `{pdf:'application/pdf', txt:'text/plain', md:'text/markdown'}`. Pass it to both `storage.upload({contentType})` and the row's `mime_type`. Reject other extensions client-side with a clear message. In `src/pages/AIAgent.jsx`, set the file input `accept=".pdf,.txt,.md"`.

n8n **09** (`8z48N73Mr45FZ9Hi`): find where it returns 422 and also accept it when the file extension of `storage_path` is pdf/txt/md (so old rows and API uploads work). Add a **Retry** action in AIAgent.jsx for `failed` docs: update `status='processing', error=null` (allowed by the RLS edit policy once the Phase 0 grant exists). Workflow 13 re-claims it because `updated_at` changes… **verify that**. 13 claims only `updated_at <= created_at + 2s` or `updated_at < now()-10min`, so a retry waits up to 10 minutes. Better: change 13's claim condition to `k.status='processing' and k.error is null and (…existing…)`, or add a `retry_requested` path. Pick the simplest one that makes Retry run on the next 2-minute tick, and document it in `docs/n8n-outbox.md`.

Test with a real `.md`, `.txt` and a text PDF. Each must reach `live`.

## Phase 3: Enquiry workspace with no page shift (highest visual priority)

Goal: Reply, Quote and Follow-up for one enquiry live under **one persistent shell**. Switching steps changes only the panel; the header, status and step strip never unmount or refetch. Standalone `/quotes` and `/follow-ups` keep working as they are.

Routes (`src/App.jsx`):
```
/enquiries/:id            element=<EnquiryWorkspace/>   (layout, has <Outlet/>-like switch)
  index                   → Reply panel
  quote                   → Quote panel
  follow-up               → Follow-up panel
/enquiries/:id/close      (keep as is, outside the workspace)
/quotes                   → <Quotes/> (standalone; if ?enquiry=ID → <Navigate to=/enquiries/ID/quote replace/>)
/follow-ups               → <FollowUps/> (standalone; same redirect for ?enquiry=)
```

New `src/pages/EnquiryWorkspace.jsx`:
- Loads `getEnquiryHeader(id)` once with `useAsync`, keyed on `id`. While loading the very first time, render a **skeleton with the same height** as `EnquiryHeader` + `FlowStrip`, never a different header.
- Renders `EnquiryHeader` (`step` derived from the URL segment: index=1, quote=2, follow-up=3).
- **Keep-alive panels:** track `visited` steps in state. Mount a panel on first visit and keep it mounted afterwards; hide inactive ones with the `hidden` attribute (not unmount). Prefetch on workspace mount: start `latestQuoteOutbox`/`quotePrefill` and `listFollowUps` for this enquiry in the background (simple module-level promise cache keyed by enquiry id in `api.js` or a small `useEnquiryCache` context), so the first switch is instant too.
- Exposes `header`, `reloadHeader` through React context (`EnquiryContext`), so a status change made in any panel updates the header without a refetch flash. Use `setData`, not `reload`, for optimistic updates.

Refactor the pages so they work both embedded and standalone:
- `Enquiry.jsx` → move body into `ReplyPanel` (drop its own `EnquiryHeader`). Keep the file name or rename; update imports.
- `Quotes.jsx` → accept props `{ enquiryId, embedded }`. When embedded, skip `PageHeader`/`EnquiryHeader` and the find box, and take `enquiryId` from props instead of `useSearchParams`. The standalone mode keeps the search (Phase 6 upgrades it).
- `FollowUps.jsx` → same pattern (`enquiryId` prop, embedded hides header/Insights).
- Update every link that points at the old URLs: `ui.jsx EnquiryHeader.steps` (`/enquiries/${id}/quote`, `/enquiries/${id}/follow-up`), `api.js nextStep`, `Enquiry.jsx` "Make Quote" banner, `Quotes.jsx` "See follow-up" link, `FollowUps.jsx` "See all follow-ups", plus anything in `Home.jsx`, `Enquiries.jsx`, `CommandPalette.jsx` (grep for `/quotes?enquiry` and `/follow-ups?enquiry`).
- In `ui.jsx FlowStrip`, use `NavLink`/`Link` with `preventScrollReset` and keep the scroll position (no scroll-to-top on step change).
- Check `Layout.jsx`: `<main>` must not change size. Give panels a stable `min-h` so a short panel doesn't make the page jump.

Acceptance: in the browser, click Reply → Send quote → Follow up → Reply repeatedly. The header never re-renders a "Loading" or different title, there is no layout jump, and there are no extra network calls for the header (check `read_network_requests`).

## Phase 4: Enquiry status and editable person details

**Status on the enquiry header** (`ui.jsx EnquiryHeader`): replace the static `Badge` with a small select of the staff labels (`STATUS_FILTERS` minus `All`). On change, call `setEnquiryStatus(id, label)` and update the workspace context optimistically. Choosing `Closed` navigates to `/enquiries/:id/close` (it needs a reason), the same rule as the list page. `Resolved` cancels follow-ups (already inside `setEnquiryStatus`).

**Edit customer** (Reply panel side card "Customer", `Enquiry.jsx` ~L307):
- Migration `20261118_contact_notes.sql`: `alter table public.contacts add column if not exists notes text;` Check that n8n 01/03 upserts on contacts don't overwrite `full_name` set by staff: inspect 03's contact upsert, and if it overwrites unconditionally, change it to `coalesce(contacts.full_name, excluded.full_name)` so AI fills gaps but never overrides staff edits.
- UI: an "Edit" button that turns the card into a form: Name, Email, Phone, Notes. Also make **AI summary** editable (`enquiries.summary`) and the trip-facts tiles editable (`travel_details`: destination, check_in, check_out, adults, children, room_requirements, budget_amount, budget_currency, special_requests). Fields the AI left empty are exactly where staff add details.
- `api.js`: `updateContact(contactId, patch)`, `updateEnquirySummary(id, summary)`, `updateTravelDetails(enquiryId, patch)` (upsert if no row; check RLS/grants first, and if insert on travel_details is not allowed, add a small `security definer` RPC). Change `getEnquiry` to return `contactId`, `notes`, and the raw travel values for the form. Validate the email format; trim everything.
- Show "Edited by staff" nowhere; keep the UI simple.

## Phase 5: Remove `{{company}}` from templates

- `api.js`: remove `company` from `TEMPLATE_VARIABLES` and from `getEnquiry().vars`.
- Data: migration `update public.email_templates set subject = replace(subject,'{{company}}','Jetwing Travels'), body = replace(body,'{{company}}','Jetwing Travels'), variables = array_remove(variables,'company') where subject like '%{{company}}%' or body like '%{{company}}%';` Also handle the `{{ company }}` spacing variant (use `regexp_replace(…, '\{\{\s*company\s*\}\}', 'Jetwing Travels', 'g')`).
- `Templates.jsx`: make sure the variable chips/help text no longer list company. Confirm with the user that the literal is "Jetwing Travels" (the brand name used everywhere in the app); use that.

## Phase 6: Quotes

**6a. Currency (USD/LKR).** Add `currency` to the quote form state (default USD) as a two-option segmented control in Step 2. Replace every hardcoded "US$" label in `Quotes.jsx` (item amount label, bank charges label, preview header, words line) with `cur = currency === 'USD' ? 'US$' : 'LKR'`. Pass `form.currency` into `sendQuote` (`currency: form.currency`). In the number-to-words line use "Cents" (USD) or "Cents" for LKR too; 07 already does this. No DB or n8n change is needed for currency.

**6b. Editable quote email.** Add Step 5 fields: **Email subject** (default `Your Jetwing Travels quotation {number}`) and **Message** (textarea, prefilled with the current 07 text in plain words, using the customer's first name). Optional template picker: reuse `listTemplates` filtered to `category='pricing'`, filled with `fillTemplate`.
- Store them without a migration: `quotations.customer_block.email_subject` / `email_body` (jsonb), and also set `outbox.subject`.
- n8n **07** (`NbX8QlrOfBL6XOWq`), node **Send quotation email**: `subject` = `q.customer_block.email_subject || <current default>`; `body_html` = when `q.customer_block.email_body` is present, escape it and turn newlines into `<br>`, otherwise the current hardcoded HTML. Back up 07 first (`docs/backups/07-before.json`).

**6c. Quote history per person.** `api.js listQuotesForContact(email)`: join `quotations → enquiries → contacts` by contact email (case-insensitive). Return number, version, currency, total, status, sent_at, pdf_path, enquiry subject. Show it in a "Quotes sent to {first}" card on the quote panel (embedded and standalone once a customer is chosen): a count in the title, then rows of **amount, sent date, PDF link** (+ number/version). PDF link: `supabase.storage.from('quotations').createSignedUrl(pdf_path, 3600)` on click (staff have the `jw_read_files` select policy). Rows with no `pdf_path` show "Not sent yet" or the status.

**6d. Customer picker with autocomplete + unknown emails** (standalone `/quotes` page; the senior called it the "Hotels & Quotes" front page).
- Replace the "Customer email or enquiry ID" input + Find button with a **combobox** (new `Combobox` in `ui.jsx`, accessible: `role=combobox`, listbox, arrow keys, Enter, Esc, 250 ms debounce).
- `api.js searchCustomers(term)`: `contacts` where `full_name ilike %t%` or `email ilike %t%` (limit 8), plus an exact enquiry-id match when `t` looks like a UUID or UUID prefix (`id::text ilike t%` through an RPC if PostgREST can't cast; otherwise exact match only). Each result carries the contact and its newest open enquiry (fall back to newest). Typing "u" lists all matching people. Selecting one sets the customer (and enquiry when there is one).
- **Free entry:** if the text is a valid email that matches no one, show an option "Send to new customer {email}" and let staff also type a name. On Send, call a new RPC `jw_app_manual_enquiry(p_email text, p_name text, p_subject text) returns uuid` (security definer, `set search_path=''`, granted to `authenticated`). It finds the contact by lower(email) or inserts one, then inserts an enquiry (status `research_in_progress`, subject = quote heading, a flag `{"source":"manual_quote"}` in `flags`) and returns the enquiry id. Then the existing `sendQuote(enquiryId, …)` runs unchanged. Inspect `enquiries` NOT NULL columns/defaults/triggers before writing it (e.g. required `gmail_thread_id`, `category`, `travel_type`), and supply sensible defaults.
- Check that n8n 05 sends correctly with an empty `gmail_thread_id` (new thread). The quote path passes `r.gmail_thread_id ?? ''`, so read 05 (`QAL2OLkUm4aSjdEO`) and fix it if it requires a thread. Also check `jw_approve_quotation` doesn't reject an enquiry with no inbound mail (`seen_latest_inbound_at` logic).
- Partial data: if a known contact lacks a name or phone, the Name field in Step 1 stays editable. On send, write back an empty `full_name` to the contact (only when it was empty) using `updateContact`.

## Phase 7: Overlapping legacy n8n workflows (flag, don't silently change)

These **active** workflows overlap the new pipeline and can cause duplicate drafts or emails: **"Jetwing Daily Follow-up"** (9am, writes Gmail follow-up drafts, same job as 08), **"AI Email Auto-Responder System"** (Gmail auto-responder), **"Jetwing Contact Us Form"** / **"Jetwing RAG Draft Engine"** (write drafts into `enquiries`), and **"My workflow"**. Do not deactivate them yourself. List what each one does (read its nodes) in the final report and recommend which ones to turn off. The user decides.

## Answer for the user: how AI drafts vs dashboard sends work today

Put this in `docs/how-email-works.md` (the user asked for the explanation) and keep it short:
1. **Mail in:** n8n **01 Process inbound mail** stores the email in `email_messages` (direction inbound) and files or creates the `enquiry`/`contact`. **03 Classify and extract** fills summary, category and `travel_details`.
2. **AI draft:** **04 Draft reply** writes the reply as a **Gmail draft** (`gmail_draft_id`) and as an `email_messages` row with `status='draft', ai_generated=true`. Staff can also press "Ask AI to write a reply", which inserts into `draft_requests`, and 04 picks it up.
3. **Staff send (one path for both AI and hand-written text):** the Reply panel shows the draft text, staff edit it, and Send inserts an `outbox` row (`kind='reply'`, `email_message_id` = the draft row). **12 Outbox sender** (every minute) sends it through **05 Send email** as a threaded reply, marks the outbox `sent`, saves the edited text onto the draft row, moves New→Answered, schedules the follow-up, and **deletes the Gmail draft**. So nothing is ever sent twice from the app path.
4. **Quotes:** outbox `kind='quotation'` → 12 → **07** (approve, PDF, email through 05, mark sent, schedule follow-up).
5. **Follow-ups:** `followups` rows → **08** (after Phase 1: every 2 min; uses the staff text if present, otherwise AI writes it) → 05.
6. **Gap to verify and fix:** if staff use "Open in Gmail" and send from Gmail itself, check whether 01 records the sent message and marks the draft row `sent`. If not, the app keeps showing a stale draft and won't count the reply. Fix it in 01 by matching the sent message's `gmail_draft_id`/thread to the draft row and setting `status='sent'`.

---

## Critical files

- `src/App.jsx` (routes), new `src/pages/EnquiryWorkspace.jsx`, `src/pages/Enquiry.jsx`, `src/pages/Quotes.jsx`, `src/pages/FollowUps.jsx`, `src/pages/AIAgent.jsx`, `src/pages/Templates.jsx`
- `src/components/ui.jsx` (`EnquiryHeader`, `FlowStrip`, new `Combobox`)
- `src/lib/api.js` (`uploadKnowledge`, `sendQuote`, `moveFollowUp`, `scheduleFollowUp`, `nextStep`, `getEnquiry`, `TEMPLATE_VARIABLES`, new `updateContact`/`updateTravelDetails`/`updateEnquirySummary`/`searchCustomers`/`listQuotesForContact`/`createManualEnquiry`)
- `supabase/migrations/20261118_*.sql`
- n8n: 08 `EZM0fXUs8FgJkvPK`, 07 `NbX8QlrOfBL6XOWq`, 09 `8z48N73Mr45FZ9Hi`, 13 `qxyMmRMYydIb9gVo`, check 05 `QAL2OLkUm4aSjdEO`, 01 `cHuUDamlwHpUqNf1`, 03 `WsI4njwlsONZqW2M`
- Reuse: `useAsync` (`setData` for optimistic updates), `fillTemplate`/`templateVars`, `setEnquiryStatus`, `statusLabel`, `subscribeOutbox`, the `ok()` helper, existing Tailwind tokens (`jw-*`), `Field`/`inputCls`/`Button`/`Card` from `ui.jsx`.

Style rules (match the existing code): plain-language UI copy, no comments unless the why is non-obvious, every api function throws on error, no new dependencies.

## Verification (do all, report evidence)

1. `npm run build` passes. Start the dev server with `preview_start` (config in `.claude/launch.json`) and sign in.
2. **Grants:** the follow-up Send now / Move / Cancel / Schedule all succeed (no "permission denied"); the network tab shows 200/204.
3. **Follow-ups:** move one to now+3 min and confirm in `followups` that it is `sent` within ~5 min with the staff text. Confirm with `search_workflow_executions` on 08 that the run succeeded. Confirm no row stays `processing`.
4. **KB:** upload `.md`, `.txt` and a text PDF; all reach Live within ~4 min. Retry on a failed doc works.
5. **No shift:** click through the steps 10×. Take screenshots before and after; header network calls happen once per enquiry. Standalone `/quotes` and `/follow-ups` still work; old `?enquiry=` URLs redirect.
6. **Status:** change status from the header and confirm it updates the header and the list. Closed routes to the close page.
7. **Contact edit:** edit name/phone/notes/summary/trip facts and reload: they persist. Then trigger a new inbound mail for that contact (or simulate 03) and confirm the staff-set name is not overwritten.
8. **Templates:** no `{{company}}` in the UI or in `email_templates`.
9. **Quotes:** send an LKR quote to an address you own. The PDF shows LKR, and the email shows the custom subject and message. History lists it with amount, date and a working PDF link. Send to a brand-new email: a contact and an enquiry are created, the quote arrives, and the follow-up is scheduled. Autocomplete: typing one letter lists the matching people.
10. Use only test addresses you own. 05 has a test mode, so check it before sending to real customers.
