# Build brief: Enquiry Desk, from an empty folder

This file is the full specification for a web app called Enquiry Desk. You are starting in an empty folder with an empty Supabase project. Nothing exists yet: no tables, no code. Read the whole file before you write anything, then build in the order given in section 14. Keep this file open as the reference; when a detail is not covered here, choose the simplest option that fits the rest of the brief and tell me what you chose in your final report.

## 1. The business and the people who use this

Jetwing Travels is a travel company in Sri Lanka. Customers write in by email (and later by WhatsApp, Facebook and Instagram) asking about hotels, tours and packages. A small reservations team answers them. Their day is the same loop for every customer: an enquiry comes in, they reply, they send a price quote if the customer wants one, they chase the customer if there is no answer, and they close the enquiry as booked or lost.

Before this app the team did all of that inside a shared Gmail inbox. Enquiries were missed, nobody could see which ones were waiting, and follow-ups depended on memory.

The users are reservations staff, not technical people. They work on a desktop most of the day and sometimes check on a phone. English is a second language for several of them. That drives two rules for everything you build:

- Every page states in one sentence what it is for, and shows one clear next action. A staff member should know what to do within five seconds of the page loading.
- All wording is plain. Short sentences, common words, no technical terms. "Queued to send" is acceptable; "outbox row inserted" is not. The exact wording for most screens is given in this brief; use it as written.

An AI assistant also works on these enquiries. It reads incoming mail, writes a summary, pulls out the trip details, and drafts a reply. Staff check the draft and send it. The AI and all sending run outside this app, in an automation tool (n8n). You are not building that part.

## 2. The one idea the whole app rests on

The app never sends an email or a chat message, and it never calls an AI model. It only reads and writes rows in the database.

When staff press Send, the app inserts a row in a table called `outbox` with status `queued`. A separate worker (n8n, later) picks the row up, sends the message through Gmail or a chat API, and sets the row to `sent` or `failed`. The app listens for that change and updates the screen. The same pattern covers asking the AI for a draft (`draft_requests` table) and reading uploaded knowledge files (`knowledge_documents.status`).

This matters for three reasons, and they should guide your choices when something is unclear:

- No secrets in the browser. The app holds only the public Supabase key. Gmail and chat credentials stay in the worker.
- Nothing is sent twice. A queued row can be cancelled until the worker claims it. A unique index stops two open AI draft requests for one enquiry.
- The screen is always honest. Staff see "Queued", then "Sent" or "Failed" with the reason, without refreshing.

Because the worker does not exist yet, you will also write one database function that plays its part for testing (section 7.7). That function is how you and I prove the app works end to end.

## 3. Scope

Build:

- The database: tables, checks, triggers, row level security, realtime, one storage bucket, seed data, and the test worker function.
- The web app: login, the app shell with navigation and a search box, and ten screens (Home, Enquiries list, one Enquiry, Close enquiry, Chats, Quotes, Follow-ups, AI Agent, Email Templates, Settings).
- A short README.

Do not build, even if it looks helpful:

- n8n workflows, Gmail or WhatsApp connections, PDF generation, or any call to an AI model.
- Staff roles or permissions. Every signed-in user can see and do everything.
- TypeScript, automated tests, dark mode, translations, a component library, a state library, a chart library, or an icon library. The reasons are in section 5.
- Sign-up or password reset screens. Staff accounts are created by an admin in the Supabase dashboard.

## 4. What I will give you before you start

Stop and ask me if any of these is missing. Do not invent values for them.

1. The Supabase project URL and the publishable (anon) key. Put them in `.env` and put placeholders in `.env.example`. Add `.env` to `.gitignore`.
2. The logo file. Save it as `src/assets/jetwing-logo.png`. Its natural size is 259 by 55 pixels. If I have not given it to you, use a text wordmark "Jetwing Travels" in the heading font and say so in the report.
3. A way to run SQL. If you have a Supabase tool connected, apply the migration yourself. If not, write the migration file, stop, and ask me to paste it into the Supabase SQL editor before you continue.
4. One staff login for testing, created by me in the Supabase dashboard. Use it only to check the app on localhost.

## 5. Stack and layout

- React 18, Vite 5, Tailwind CSS 3, React Router 6, `@supabase/supabase-js` 2. JavaScript with JSX, not TypeScript.
- No other runtime dependencies. Charts are hand-drawn SVG. Icons are a small set of inline SVG paths in one file. State is React state plus one small data-loading hook. The app is about 3,500 lines; extra libraries would add more weight than they remove, and the look depends on details a chart or UI library would override.
- Node 18 or newer. Scripts: `dev`, `build`, `preview`.

File layout:

```
index.html
tailwind.config.js, postcss.config.js, vite.config.js
.env.example
supabase/migrations/0001_schema.sql
supabase/migrations/0002_seed.sql
supabase/migrations/0003_dev_worker.sql
src/main.jsx            BrowserRouter > AuthProvider > App
src/App.jsx             routes; shows Login when there is no session
src/index.css           Tailwind layers, base styles, 3 keyframes
src/lib/supabase.js     creates the client; throws a clear error if env is missing
src/lib/auth.jsx        AuthProvider, useAuth, signIn, signOut, changePassword
src/lib/useAsync.js     data-loading hook
src/lib/useLiveEnquiries.js
src/lib/api.js          every database read and write
src/components/ui.jsx   shared components
src/components/Icon.jsx
src/components/Layout.jsx
src/components/CommandPalette.jsx
src/pages/*.jsx         one file per screen
```

Two structural rules:

- Pages never import the Supabase client. Every query lives in `src/lib/api.js`, and every function there throws on error. This keeps each page to one loading state and one error state, and gives a single file to change when the database changes.
- `api.js` returns data already shaped for display (names resolved, dates formatted, status labels derived). Pages render; they do not transform.

`useAsync(fn, deps)` runs an async loader and returns `{ data, error, loading, reload, setData }`. On reload it keeps the old data on screen while loading. `setData` accepts a value or an updater function and is used for optimistic updates.

## 6. Status model

This is the part most likely to go wrong, so it is stated exactly.

An enquiry has one of five stored statuses. Staff see six labels. The sixth comes from the close reason.

| Stored `status` | `closed_reason` | Label staff see | What staff do next | Where the next-step button goes |
|---|---|---|---|---|
| `new` | null | New | Send reply | `/enquiries/:id` |
| `research_in_progress` | null | In progress | Send quote | `/quotes?enquiry=:id` |
| `quotation_sent` | null | Answered | Wait for customer | no button |
| `followup_due` | null | Follow-up | Follow up | `/follow-ups` |
| `closed` | `booking_confirmed` | Resolved | Nothing to do | no button |
| `closed` | any other reason | Closed | Nothing to do | no button |

Rules:

- `closed_reason` and `closed_at` are set if and only if `status = 'closed'`. Enforce this with a check constraint. Moving an enquiry away from closed clears both.
- Staff can change the label from the Enquiries list. Choosing Resolved sets `closed` with `booking_confirmed`. Choosing Closed does not save anything; it opens the Close screen, because closing needs a reason.
- Closing or resolving an enquiry cancels its follow-ups that are `scheduled` or `due` (`status = 'cancelled'`, `cancelled_reason = 'enquiry_closed'`).
- When the worker sends a reply to a `new` enquiry, the enquiry becomes `quotation_sent`. Other statuses are left alone.

Close reasons, as value and label: `booking_confirmed` Booked with us; `customer_declined` Customer chose another company; `no_response` No reply from customer; `not_suitable` Not a fit for us; `duplicate` Duplicate enquiry.

Put the label mapping, the next-step function and the close reasons in `api.js` and use them everywhere. Do not repeat the mapping inside pages.

## 7. Database

All tables are in the `public` schema, with `id uuid primary key default gen_random_uuid()` and `created_at timestamptz not null default now()` unless stated. Use `text` with check constraints for fixed value lists, not enum types, so values can be added later with one statement.

### 7.1 Tables

```
contacts
  full_name text, email text unique, phone text

enquiries
  contact_id -> contacts
  subject text, summary text            summary is written by the AI
  status text not null default 'new'    new | research_in_progress | quotation_sent | followup_due | closed
  closed_reason text                    booking_confirmed | customer_declined | no_response | not_suitable | duplicate
  closed_at timestamptz
  category text default 'general'       general | service | booking | support
  travel_type text default 'unknown'    hotel | package | tour | corporate | unknown
  flags jsonb not null default '{}'     the close note is stored as flags.close_note
  gmail_thread_id text
  updated_at timestamptz not null default now()

travel_details                          one row per enquiry (unique enquiry_id)
  enquiry_id -> enquiries on delete cascade
  destination text, check_in date, check_out date
  adults int, children int, room_requirements text
  budget_amount numeric, budget_currency text default 'USD'
  special_requests text

email_messages
  enquiry_id -> enquiries on delete cascade
  direction text        inbound | outbound
  status text           received | draft | sent | discarded | failed
  sender text, sender_name text, subject text
  body_text text, body_html text
  send_type text        manual | quotation | auto_followup | auto_faq
  ai_generated boolean not null default false
  gmail_message_id text, gmail_draft_id text
  draft_meta jsonb      draft_meta.sources is a list of knowledge file titles the AI used
  message_at timestamptz

followups
  enquiry_id -> enquiries on delete cascade
  due_at timestamptz not null
  status text not null default 'scheduled'   scheduled | due | processing | sent | failed | cancelled
  message_body text     null means the AI writes it when it goes out
  source text default 'quotation'            quotation | staff
  sent_at timestamptz, last_error text, cancelled_reason text

quotations
  enquiry_id -> enquiries on delete cascade
  quotation_number text not null, version int not null   unique (enquiry_id, version)
  currency text default 'USD', subtotal numeric default 0, taxes numeric default 0, total numeric default 0
  status text default 'pending_approval'     pending_approval | approved | sent
  customer_block jsonb   name, company, address, heading, date, note, email, phone, prepared_by
  payment_details text

quotation_items
  quotation_id -> quotations on delete cascade
  position int, description text, quantity numeric default 1
  unit_price numeric, total_price numeric, is_bank_charge boolean default false

outbox
  kind text not null         reply | quotation | chat
  channel text default 'email'   email | whatsapp | facebook | instagram
  enquiry_id -> enquiries on delete set null
  email_message_id -> email_messages on delete set null   the AI draft this reply came from, if any
  quotation_id -> quotations on delete set null
  conversation_id -> conversations on delete set null
  to_address text, subject text, body text
  status text not null default 'queued'   queued | processing | sent | failed | cancelled
  last_error text
  created_by uuid not null default auth.uid() -> auth.users
  processed_at timestamptz

draft_requests
  enquiry_id -> enquiries on delete cascade
  status text not null default 'queued'   queued | processing | done | failed
  last_error text
  created_by uuid not null default auth.uid() -> auth.users
  processed_at timestamptz

conversations
  channel text not null      whatsapp | facebook | instagram | email
  external_id text           unique (channel, external_id)
  customer_name text not null, contact_handle text
  enquiry_id -> enquiries on delete set null
  labels text[] not null default '{}'
  facts jsonb not null default '{}'       for example {"Place":"Kandy","Dates":"Dec"}
  ai_suggestion text
  unread_count int not null default 0 check (>= 0)
  last_message_at timestamptz not null default now()
  updated_at timestamptz not null default now()

conversation_messages
  conversation_id -> conversations on delete cascade
  direction text not null    inbound | outbound
  body text not null
  status text not null default 'received'   received | queued | sent | failed
  created_by uuid -> auth.users

knowledge_documents
  title text not null
  doc_type text not null     business | services | pricing | faq | documents
  storage_path text, mime_type text
  status text not null default 'processing'   processing | live | off | failed
  error text
  updated_at timestamptz not null default now()

agent_settings               exactly one row, id int primary key check (id = 1)
  tone text default 'Warm and professional'
  extra_instructions text default ''
  auto_faq_enabled boolean default false
  faq_confidence numeric default 0.7
  auto_followup_enabled boolean default true
  followup_delay_days int default 2

email_templates
  name text not null
  category text not null     initial_response | pricing | service_info | meeting_invite | more_info |
                             followup_1 | followup_2 | followup_final | thank_you | closure
  subject text not null default '', body text not null default ''
  variables text[] not null default '{}'
  is_active boolean not null default true
  created_by uuid default auth.uid()
  updated_at timestamptz not null default now()

activity_logs
  enquiry_id -> enquiries on delete cascade
  action text not null       snake_case, for example enquiry_created, draft_saved
  actor text not null        n8n | ai | staff
  details jsonb

notifications
  type text not null         for example workflow_error
  message text
```

### 7.2 Indexes

- `outbox (created_at) where status = 'queued'`, and `outbox (enquiry_id)`.
- `draft_requests (enquiry_id) where status in ('queued','processing')`, unique. This is what stops a double click from creating two AI drafts. The app relies on the unique violation (Postgres code 23505) to show "already writing".
- `conversations (last_message_at desc)`, `conversation_messages (conversation_id, created_at)`.
- `enquiries (created_at desc)`, `email_messages (enquiry_id)`, `followups (enquiry_id)`, `followups (due_at) where status in ('scheduled','due')`.

### 7.3 Triggers

- A generic "touch" trigger sets `updated_at = now()` before update on `enquiries`, `conversations`, `knowledge_documents` and `email_templates`.
- After insert on `conversation_messages`: set the conversation's `last_message_at` to the message time; if the message is inbound add 1 to `unread_count`, if outbound set it to 0 and clear `ai_suggestion`. This function is `security definer` with an empty `search_path`, and execute is revoked from `public`, `anon` and `authenticated`.
- After insert, update or delete on `quotation_items`: recalculate the parent quotation's `subtotal` (sum of items that are not bank charges) and `total` (sum of all items plus taxes). Staff never write totals; the database owns them.

### 7.4 Row level security

Enable RLS on every table. The `anon` role gets nothing. For the `authenticated` role:

- Select: allowed on every table.
- `enquiries`: update allowed.
- `followups`: insert allowed only with `status = 'scheduled'`; update allowed.
- `quotations`, `quotation_items`: insert allowed.
- `outbox`: insert only when `created_by = auth.uid()` and `status = 'queued'`. Update only on your own rows that are still `queued`, and only to `queued` or `cancelled`. This is the Undo button.
- `draft_requests`: insert only when `created_by = auth.uid()` and `status = 'queued'`. No update.
- `conversations`: update allowed (labels, unread count).
- `conversation_messages`: insert only when `direction = 'outbound'`, `status = 'queued'` and `created_by = auth.uid()`.
- `knowledge_documents`: insert allowed; update allowed.
- `agent_settings`: update allowed.
- `email_templates`: insert, update, delete allowed.
- No policy for anything not listed. In particular staff cannot write `email_messages`, `activity_logs`, `notifications`, `contacts` or `travel_details`; those belong to the worker.

Write `auth.uid()` inside policies as `(select auth.uid())` so it is evaluated once per query.

### 7.5 Realtime and storage

- Add these tables to the `supabase_realtime` publication: `enquiries`, `outbox`, `draft_requests`, `conversations`, `conversation_messages`.
- Create a private storage bucket named `knowledge`. Authenticated users may upload to it and read from it.

### 7.6 Seed data

The app must look like a working desk on first load, with every screen showing real content. Seed data in `0002_seed.sql`, using dates relative to `now()` so it never goes stale. Use Sri Lankan destinations (Kandy, Galle, Sigiriya, Ella, Yala, Bentota, Colombo) and a mix of customer names from different countries. Use `example.com` addresses.

- 14 enquiries, created across the last 14 days with at least 2 today and 2 yesterday. Statuses: 4 new, 2 in progress, 3 answered, 2 follow-up, 2 resolved, 1 closed as no reply. Spread across all categories and trip types. Each has a contact, a one or two sentence AI summary, and a travel_details row. Leave some trip facts empty on purpose (no dates on two, no budget on three) so the "missing facts" feature has something to show.
- Email messages: every enquiry has one inbound message. Two of the new ones have an outbound AI draft (`status = 'draft'`, `ai_generated = true`, `draft_meta.sources` with two file titles); two have no draft. One new enquiry has two inbound messages in a row. Answered ones have a sent outbound reply. One inbound message quotes an earlier mail in Gmail style ("On Mon, Nov 16, 2026 at 9:36 PM Name <a@b.com> wrote:" followed by lines starting with ">").
- Follow-ups: 2 due today, 3 scheduled in the next week, 4 sent in the last 30 days (two of them followed by a later inbound message from the customer), 1 failed with a `last_error`.
- Quotations: 2, each with 3 items and a bank charge, linked to answered enquiries, each with a matching `outbox` row of kind `quotation` and status `sent`.
- Conversations: 5 (2 WhatsApp, 1 Facebook, 1 Instagram, 1 email) with 3 to 6 messages each, labels, facts, one AI suggestion, and two with unread counts. Link two of them to enquiries.
- Knowledge documents: 6 across the five sections; 4 live, 1 off, 1 failed with an error.
- The single `agent_settings` row.
- 4 email templates in different categories that use `{{customer_name}}`, `{{destination}}`, `{{dates}}` and `{{agent_name}}`.
- 10 activity log rows across three enquiries, and one `workflow_error` notification from four days ago.

### 7.7 Test worker

In `0003_dev_worker.sql`, create `public.dev_run_worker()` returning a text summary of what it did. Execute is granted to `service_role` only; revoke it from `public`, `anon` and `authenticated`. Put a comment at the top saying it stands in for n8n and should be dropped once the real worker exists. Each call does the following:

- Every queued `outbox` row of kind `reply`: insert an outbound `email_messages` row (`status = 'sent'`, `send_type = 'manual'`, `body_text` from the outbox body, `message_at = now()`), or if `email_message_id` points at a draft, update that draft row to `sent` with the new body. Move the enquiry from `new` to `quotation_sent`. Set the outbox row to `sent` with `processed_at`.
- Every queued row of kind `quotation`: set the quotation to `sent`, insert an outbound email message with `send_type = 'quotation'`, insert a follow-up due in `agent_settings.followup_delay_days` days, set the outbox row to `sent`.
- Every queued row of kind `chat`: set the matching queued `conversation_messages` row to `sent`, and the outbox row to `sent`.
- Every queued `draft_requests` row: if the enquiry already has an open draft, mark it `done`. If it has no inbound message, mark it `failed` with "This enquiry has no customer email to reply to." Otherwise insert an outbound draft with a short canned reply and mark it `done`.
- Every `knowledge_documents` row in `processing`: set it to `live`.

## 8. Design system

The look is quiet and formal: white cards on an off-white page, square corners, one olive green for structure, one magenta used only for the main action on a screen.

Tailwind theme extension:

```
colors.jw:
  olive #ADAB3F        olive-dark #8C8A01     olive-deep #737101     olive-light #D3D162
  magenta #E30079      magenta-dark #C9036C
  pale #F6F6E6         mid-gray #999999
  ink #000000          offwhite #F8F8F8       gray #555555
  border #D4D4D4       line #EEEEEE
fontFamily.head: "Playfair Display", Georgia, serif
fontFamily.body: Raleway, "Helvetica Neue", Helvetica, Arial, sans-serif
borderRadius: DEFAULT 0, card 4px
```

Load both fonts from Google Fonts in `index.html`: Playfair Display 500, 600, 700 and Raleway 400, 500, 600, 700. Page title: "Enquiry Desk · Jetwing Travels".

How the colours are used:

- `olive-deep` is the structural colour: active navigation, selected rows, active tabs and chips, links, small uppercase labels, the chart, avatars for new items.
- `magenta` is for the one primary button on a screen and for the "new, unanswered" dot. Nothing else. If two magenta buttons would appear on one screen, one of them is wrong.
- `pale` is the background for selected rows, notices and the "what to do now" banner.
- `ink` is for headings and important values. Errors use an `ink` left border on white or off-white, not red. Do not use red anywhere.
- Body text is `gray` on `offwhite`. Placeholder and "Not given" text is `mid-gray`.
- Card borders use `border`; row dividers inside cards use `line`.

Type and spacing:

- Body is 14px Raleway. Raleway uses old-style figures by default, which look wrong for prices and counts, so set `font-feature-settings: 'lnum' 1` on `body`, and use `tabular-nums` wherever numbers line up.
- Page titles are 28px Playfair bold. Card titles are 16px Playfair semibold. Big numbers on stat cards are 30 to 34px Playfair semibold.
- Small labels are 11 to 12px, semibold, uppercase, with slight letter spacing.
- Buttons, inputs, tabs and chips are at least 40px tall, and primary buttons 44px, so they work with a finger.
- Every focusable element shows a 2px `olive-dark` outline with 2px offset on keyboard focus. Set this once in the base layer.
- Selected rows everywhere use the same treatment: `pale` background and a 3px `olive-deep` bar on the left edge (inset box shadow).
- No drop shadows except on the login card and the search box.

Keyframes in `index.css`: `cp-fade` (opacity from 0) and `cp-rise` (opacity from 0, 8px up, scale 0.985) for the search box; `enq-new` for a newly arrived enquiry row (slides in from 8px above with a `pale` background, holds the tint, fades to transparent over 8 seconds). Run animations only under `motion-safe`.

## 9. Shared components (`ui.jsx`)

Build these first and use them on every page. Page files should contain layout and behaviour, not repeated class strings.

- `PageHeader({ title, purpose, back, actions })`: title, one-line purpose (max width 720px, 15px), optional "< Back to ..." link above the title, optional actions on the right.
- `NextBanner({ label, text, action, role })`: the "what to do now" banner. `pale` background, 4px `olive-deep` left border, small uppercase label, one sentence in 17px Playfair, optional button on the right.
- `Card({ title, subtitle, right, accent, children })`: white, 1px border, 4px radius. Optional header row with a bottom border. `accent` adds a 3px `olive-deep` top border and marks the card where the main action happens.
- `Badge({ tone })` with tones `blue` (olive-deep on white text), `pale`, `ink`, `line` (outlined). `statusTone(label)` maps New to blue, Answered to pale, In progress and Follow-up to ink, Resolved and Closed to line.
- `Button({ variant, to, href })`: `primary` (magenta), `secondary` (white with olive-deep border and text, the default), `dark` (ink). Renders a router link when given `to`, an anchor when given `href`, otherwise a button.
- `Chip({ on, count })`: filter chip with a count, `aria-pressed`.
- `Toggle({ checked, onChange, label, labelledBy })`: a square switch, `role="switch"`.
- `Segmented({ options, value, onChange })`: joined buttons for two or three choices.
- `Field({ label })`: uppercase label above a control. `inputCls` and `textareaCls`: shared class strings (44px tall inputs, 1px border, white).
- `Table({ columns, rows, rowTo, template, minWidth, selected })`: a CSS grid table with an off-white header row, 56px rows, optional whole-row links, horizontal scroll below `minWidth`.
- `Kbd`: a small key cap.
- `SentNotice({ onUndo })`: `pale` status strip with an optional Undo button.
- `Loading({ what })`, `ErrorState({ error, onRetry })`, `Empty`: the three states every data view must handle. `ErrorState` says "Could not load this." followed by the error message and a "Try again" button.
- `FlowStrip({ current, items })`: a row of numbered steps. The current step is `olive-deep` with white text; earlier steps have a `pale` number; later ones are grey.
- `EnquiryHeader({ e, step, done })`: used on the Enquiry, Quotes and Follow-ups screens when they are showing one customer. It renders the customer's name as the title, "subject · email" as the purpose, a status badge, a "Close Enquiry" button (hidden when closed), and a three-step FlowStrip: 1 Reply ("You or the AI writes"), 2 Send quote ("If they asked for prices"), 3 Follow up ("If they go quiet"). Each step links to that screen for this enquiry. This shared header is what makes three separate pages feel like one job.
- `SettingsTabs({ current })`: two link tabs, "AI Agent" and "Settings".

`Icon.jsx` holds inline 24px stroke icons (stroke width 2, round caps): home, mail, chat, hotel, clock, sliders, search, lock, grid, inbox, doc, template, logout, menu, close, plus a filled four-point "spark" used wherever something came from the AI.

## 10. App shell

Auth: `AuthProvider` reads the current session, subscribes to auth changes, and exposes `{ session, user, loading }`. `App` shows "Loading…" while the session loads, the Login screen when there is none, and the routes otherwise. `changePassword(email, current, next)` first signs in again with the current password and returns "Current password is wrong." if that fails, then updates the password.

Routes, all inside the Layout: `/` Home, `/enquiries`, `/enquiries/:id`, `/enquiries/:id/close`, `/chats`, `/quotes`, `/follow-ups`, `/ai-agent`, `/templates`, `/settings`.

Layout: a 264px white sidebar on the left on medium screens and up, fixed to the viewport height, with the main content beside it (32px padding, 20px gap between blocks). From top to bottom the sidebar holds:

1. The logo at 176px wide, then a thin line, a small magenta square and the words "ENQUIRY DESK" in small spaced capitals.
2. A button styled as a search field: "Search enquiries…" with a key cap showing "Ctrl K" (or "⌘K" on a Mac). It opens the search box.
3. Navigation in three labelled groups, ordered the way an enquiry moves: Overview (Dashboard), Reservations (Enquiries, Chats, Hotels & Quotes, Follow-ups), Configuration (AI Agent, Email Templates, Settings). The active item has a `pale` background, `olive-deep` text and a 3px bar on its left.
4. At the bottom, a user card: square avatar with initials, the name (from user metadata, or the part of the email before the @), "Reservations team", and a sign-out icon button. Under it, "© {year} Jetwing Travels (Pvt) Ltd".

On small screens the sidebar becomes a sticky top bar with the logo and a menu button that opens the same navigation as a panel. The panel closes when the route changes.

Login screen: a centred white card, 420px wide, 3px `olive-deep` top border. Logo and "ENQUIRY DESK" mark, heading "Sign in", line "Jetwing Travels reservations team.", email and password fields, a magenta "Sign In" button that reads "Signing in…" while busy, the error message in the standard error style, and the note "New staff are added by the admin in Supabase (Authentication, Users)."

Search box (`CommandPalette`): opens with Ctrl+K or Cmd+K from anywhere, or with "/" when the user is not typing in a field. It is a dialog 880px wide near the top of the screen over a dark overlay; clicking the overlay or pressing Esc closes it and returns focus to where it was.

- On open it loads the enquiry list fresh.
- With nothing typed it shows two groups: "Needs you now" (up to 5 enquiries that have a next step, each going straight to that step) and "Go to" (every page).
- With text typed it shows "Enquiries" (up to 6 matches; every typed word must appear in the name, email, subject or status), then "Do something for {name}" with three actions for the top match if it is not closed (Send a quote to, Follow up with, Close enquiry), then matching pages.
- Arrow keys move through one flat list and wrap; Enter opens; Tab is trapped. The highlighted row uses the standard selected style.
- On medium screens and up, a 320px panel on the right shows the highlighted enquiry "at a glance": name, email, AI summary and the six trip facts, loaded 120ms after the highlight settles and cached for the session, and the next step at the bottom.
- A footer shows the keys and "{n} enquiries searched".
- Use the combobox and listbox ARIA pattern with `aria-activedescendant`.

## 11. Screens

Shared formatting used below. `when(ts)`: "Today 14:05", "Yesterday 09:30", "Tomorrow 10:00", otherwise "16 Nov 14:05" (24-hour, en-GB). Trip facts are always the same six, in this order: Place, Dates, People, Rooms, Budget, Extra. A missing value shows "Not given" and is flagged as missing. People reads like "2 adults, 1 child". Budget reads like "USD 2,500". A customer's display name is their full name, or their email, or "Unknown".

### 11.1 Home (`/`)

Header: "Home", purpose "Your work for today, in the order you do it."

1. NextBanner labelled "Start here". Text depends on the data: if there are new enquiries, "{n} new enquiries have an AI draft ready. Read each one and press Send." (singular form for one); otherwise if anything needs action, "No new enquiries. Work through the list below, top to bottom."; otherwise "Nothing needs you right now. New mail appears here automatically." The button "Open First Enquiry" goes to the next step of the first item that needs action.
2. Six stat cards in a grid (2 columns on phones, 3 on tablets, 6 on wide screens), each a link: Total ("All enquiries so far."), New ("Not opened yet."), Need replies ("Customer wrote last."), Answered ("We have replied at least once."), Follow-ups to do ("Due today or overdue."), Follow-ups scheduled ("Going out later."). "Need replies" counts open enquiries whose most recent received or sent mail is inbound, or that have no mail.
3. "Enquiries Over Time" card. A segmented control switches between Days (last 14 days), Weeks (last 12 weeks, starting Monday) and Months (last 12 months). Above the chart: counts for Today, This week, This month, and a legend with totals for "Enquiries in" and "Replies out". The chart is hand-drawn SVG, 240px tall: two smooth filled areas in `olive-deep`, enquiries strong and replies faint, with horizontal grid lines at quarters, a y-axis of five labels, and x labels (every second one when there are more than 12 points). Use a Catmull-Rom curve converted to cubic Béziers, with control points clamped so the curve never dips below zero. Draw the SVG with `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke`, and place the data dots as absolutely positioned HTML elements so they stay round. Each point has an invisible full-height hover and focus target showing a dark tooltip with the label and both numbers, plus a vertical guide line. Each target has an `aria-label` with the same text.
4. Three donut cards side by side: "By Category", "By Trip Type", "By Source". Each donut is one hue; slices are `olive-deep` at opacities 1, 0.7, 0.45, 0.28, 0.14 from largest to smallest. The total sits in the centre. A legend lists label, count and percent. Source counts email enquiries plus conversations by channel. Use a circle of radius 15.9155 so the circumference is 100 and dash lengths are percentages.
5. "Needs You Now" card: a table of up to 6 enquiries that have a next step, with Name, Subject, Status badge and "Next step →". Each row links to that step. "View all" goes to the list.

The page reloads its data whenever an enquiry is added or changed (section 12).

### 11.2 Enquiries (`/enquiries`)

Header: "Enquiries", purpose "Every enquiry from the inbox, newest first. The line under each name is what the customer wants." When the live connection is up, show a small pulsing dot and the word "Live" on the right.

This is an inbox, not a spreadsheet.

- A row of underline tabs filters by label: All, New, Answered, In progress, Follow-up, Resolved, Closed, each with a count. A search field on the right ("Search name, email, subject or summary") filters after a 250ms pause.
- Rows are grouped under headings Today, Yesterday, Last 7 days, Older, each heading with its count.
- Each row: a square avatar with the first letter (olive-deep when New); the name with a relative time ("5m ago", "3h ago", "2d ago", then a short date); the subject; and the AI summary on a third line, falling back to the email. New rows are bold and carry a magenta dot. The whole row is a link to the enquiry.
- On the right of each row, above the link: a status pill that is a select, styled per label, and a next-step button ("Send reply →") or plain grey text when there is nothing to do ("Wait for customer").
- Changing the pill updates the row immediately, saves, then shows "{name} is now "{label}"." If saving fails, show "Could not change {name}: {reason}" and reload. The Closed option reads "Closed… (pick reason)" and opens the Close screen.
- When a new enquiry arrives while the page is open: show "A new enquiry just arrived." (or "{n} new enquiries just arrived."), and give the new rows a magenta left bar and the `enq-new` animation for 8 seconds.
- While loading for the first time show six skeleton rows. Empty states: "No enquiries match this filter." or "No enquiries yet. New mail appears here automatically." Footer: "Showing {n} enquiries".

### 11.3 One enquiry (`/enquiries/:id`)

This page has one job: answer the customer. Layout from top: the shared EnquiryHeader at step 1, a NextBanner, the six trip facts as cards (missing ones dashed and grey), then two columns. The wide column has the conversation and, directly under it, the reply box, so staff read down and then answer. The narrow column has the AI summary, customer details and activity.

Banner text by state: closed, "This enquiry is closed. Nothing to do."; a reply is queued, "Your reply to {first} goes out within a few minutes. When {first} answers, make the quote." with a "Make Quote" button; an AI draft exists, "The AI already wrote a reply under the conversation. Check it, change anything, press Send."; otherwise "Read what {first} wants, then write your reply under the conversation and press Send."

Conversation card: messages oldest first in chat bubbles, inbound on the left in white, outbound on the right in olive-deep, each with sender and time. The newest inbound message carries a "Latest" badge. Messages sent as a quote carry "Quote, PDF attached"; automatic follow-ups carry "Follow-up". The list is at most 440px tall, scrolls, and opens scrolled to the bottom. If the last two messages are both from the customer, show a "Waiting on us" badge on the card.

Building the thread: show only received and sent messages. Use `body_text`, or convert `body_html` to text when it is empty (line breaks for `br` and block ends, bullets for list items, strip style and script). Emails often quote the earlier mail. Split each body at a line matching "On {date} {name} wrote:"; show only the part above it. If the quoted part is a mail that does not exist as its own row (compare a normalised first 60 characters), show it as its own earlier bubble with the quoted sender and date.

Reply card (accent): title "Your reply to {first}", with a segmented control "Use AI reply" / "Write it myself". It starts on the AI side when a draft exists. The two sides keep separate text so switching loses nothing.

- A "To" line with the customer's email; a template picker listing active templates grouped by category; an editable Subject that starts as the draft's subject or "Re: {subject}", with a "Reset" link when changed.
- Choosing a template fills the body (and the subject if the template has one), replacing `{{customer_name}}`, `{{service}}`, `{{company}}`, `{{destination}}`, `{{dates}}` and `{{agent_name}}` with known values and leaving unknown ones as they are. If there is already text, confirm before replacing. Show "Template "{name}" added. Change anything before sending."
- While any `{{placeholder}}` remains in the subject or body, show "Still to fill in: {{dates}}. We don't have these for {first} yet, so replace them with your own words." and block sending with "Fill in {{dates}} before sending."
- On the AI side with no draft: a dashed box saying "The AI has not written a reply for this enquiry." with "Ask AI to write a reply" and "Write it myself". Asking inserts a `draft_requests` row; the box then reads "The AI is writing a reply… It usually takes 1 to 2 minutes. It appears here by itself." If the request failed, show "The last try failed: {reason}" and a "Try again" button. A unique violation shows "The AI is already writing a reply for this enquiry."
- If any of Place, Dates, People, Rooms or Budget is missing, show "{first} has not told us: travel dates and budget." with an "Add the question" button. It inserts one sentence asking for those facts, placed above the sign-off if the reply ends with one (a line containing only "Kind regards," or similar), otherwise at the end. Then it reads "Question added to your reply."
- If the AI draft lists sources, show "The AI used:" followed by the file titles as small tags.
- "Send Reply" (magenta, also Ctrl+Enter) inserts an `outbox` row of kind `reply`. It needs a subject and a body. Afterwards the card shows "Queued to send to {first}. It goes out within a few minutes." with an Undo button. Undo cancels the row only if it is still `queued`; otherwise show "Too late to undo: it is already being sent." When a draft exists, also offer "Open in Gmail".
- The page subscribes to changes on this enquiry's `outbox` and `draft_requests` rows and reloads when they change. A reload must never overwrite what staff have typed: reset the subject, AI text and mode only when the enquiry id or the draft id changes.

Side column: an "AI summary" block with the spark icon ("The AI has not summarised this enquiry yet." when empty); a "Customer" card (Name, Email, Phone, Customer since, Received, Assigned agent, the last always "Unassigned"); an "Activity" card listing outbox events ("Reply queued to send.", "Quote sent.", "Reply failed: {reason}.") and activity log rows, newest first, as a small timeline with filled dots for the AI and hollow dots for staff.

### 11.4 Close enquiry (`/enquiries/:id/close`)

A dialog-style page over a dimmed background. Title "Close This Enquiry". Line: "Last step. {name}, {subject}. Pick why it ended, then press Close Enquiry." Five radio rows for the reasons (the selected one in `pale` with an olive border), an optional note, the line "Closing also cancels any scheduled follow-up. The reason is saved with the enquiry.", and buttons "Cancel" (back to the enquiry) and a dark "Close Enquiry". On success go to the list.

### 11.5 Quotes (`/quotes`, optionally `?enquiry=:id`)

Two cards side by side: the form on the left, a live preview of the document on the right.

Without an enquiry in the URL: header "Send a quote", purpose "Type the customer's email or enquiry ID to start. Their details fill in for you." Part 1 has a field and a "Find" button; it looks up by enquiry ID or exact email, prefers the newest open enquiry, and on success puts the id in the URL. Not found: "No enquiry found for that email or ID."

With an enquiry: the shared EnquiryHeader at step 2, and part 1 shows the customer in a `pale` box with a "Change" link.

The form has five numbered parts: 1 Customer (name, company, address or email); 2 Quote details (quote number with placeholder "Made for you if empty", date, heading); 3 Items (rows of description and amount in US$, "Add Item", "Remove", and a bank charges field); 4 Payment details (beneficiary defaulting to "Jetwing Travels (Private) Ltd", bank defaulting to "Commercial Bank of Ceylon PLC", account number, optional note); 5 Send. The heading is prefilled as "Being cost of accommodation and transport arrangement in {destination} from {check-in} to {check-out}".

The preview updates on every keystroke and is laid out like the printed quotation: company name and address ("Sri Lanka | Jetwing House, 46/26 Navam Mawatha, Colombo 2"), "QUOTATION", customer block, quote number and date, a bordered box with the heading, each item with its amount to two decimals, "Bank charges = US$ x", "Grand Total", and the total in words ("US$ Two Thousand Four Hundred And 50/100 Only"), then the payment details.

Sending saves a `quotations` row with the next version number for that enquiry and status `pending_approval`, its items (bank charges as a final item flagged `is_bank_charge`), and an `outbox` row of kind `quotation`. Do not write subtotal or total. Rules:

- Needs an enquiry, a valid customer email, and at least one item with a description.
- If a quote for this enquiry is already queued or processing, block with "A quote is already on its way to {first}. Wait until it shows Sent, then send a revised one if needed."
- If one was already sent, confirm first: "{first} already has a quote (version 1). Send a revised quote (version 2)? They will get a second email."
- After sending, show the state and keep it current through the outbox subscription: "Quote saved and queued for {email}. It usually goes out within 1–2 minutes. This updates by itself.", then "Quote sent to {email}. A follow-up is set." with a link to that customer's follow-ups, or "The quote was not sent. {reason} Fix it, then press Send Quote again."

### 11.6 Follow-ups (`/follow-ups`, optionally `?enquiry=:id`)

For all customers: header "Follow-ups", purpose "Reminders to customers who went quiet: what is due, what went out, and whether customers replied." Then six insight cards: Due now, Scheduled, Sent (last 30 days), Failed, Customer replied (with "{n}% of sent follow-ups got a reply."; a follow-up counts as replied when the same enquiry has an inbound mail after it was sent), and Avg wait in days from created to sent.

For one customer (`?enquiry=`): the shared EnquiryHeader at step 3 and a "See all follow-ups →" link, no insight cards, and the tab opens on the first one that has items.

Below, two cards. Left: tabs "Due now" (scheduled or due, on or before the end of today), "Scheduled" (later), "Sent" (latest 50), each with a count, and a table with Customer, Quote, Due or Sent, and Next step ("Open →", "Failed" or "Sent"). Clicking a row selects it; the customer name links to the enquiry. Footer: "A follow-up is made 2 days after a quote goes out. If the customer replies first, it is cancelled for you."

Right (accent): the selected follow-up. Subject "Re: {enquiry subject}", the last error if any, and a text area with the message ("Leave empty and the AI writes it when it goes out."). Three actions: "Send Follow-up" sets `due_at` to now and saves the text, then shows "Queued. It goes out within a few minutes."; "Move Date" swaps the buttons for a date-time field with Save and Back; "Cancel It" asks "Cancel this follow-up to {name}? It will not go out." with "Yes, Cancel It" and "Keep It". The Sent tab is read-only. After any action reload the list, the counts and the insights.

For one customer, also allow scheduling a new follow-up with a date (default two days from now) and optional text, saved with `source = 'staff'`.

### 11.7 Chats (`/chats`)

Header: "Chats", purpose "Every customer message from WhatsApp, Facebook, Instagram and email in one place. Pick a chat, read it, reply."

Filter chips by app with counts (All, WhatsApp, Facebook, Instagram, Email). Then one card split in two.

Left, the chat list, newest activity first: name, time, the last message (prefixed "You: " when outbound), an unread count, a badge for the app and a badge for the first label or "No label". The first chat is selected on load.

Right, the selected chat: avatar with initials, name, "Chatting on {app} · {handle}"; buttons "Open Enquiry" and "Make Quote" when the chat is linked to an enquiry; a strip of trip facts from `facts`, or "No trip details yet"; labels with remove buttons and "+ Add label", which reveals the unused labels from this fixed list: New, Needs quote, Quote sent, Follow-up due, Honeymoon, Family, Group, VIP, Booked, Closed. Then the message bubbles, an "AI suggested reply" strip with "Use This Reply" when a suggestion exists, and a one-line input with "Send". Enter sends. Note below: "It is queued and goes out on {app} within a minute."

Behaviour: opening a chat sets its unread count to 0. Label changes apply immediately and roll back with "Could not save labels." on failure. Sending shows the message at once with "Queued", inserts a `conversation_messages` row and an `outbox` row of kind `chat`, and on failure marks the bubble "Not sent", restores the text to the input and shows "Could not queue your message." The page subscribes to both chat tables and reloads the list and the open chat on any change. Empty state: "No chats yet. Messages from WhatsApp, Facebook and Instagram appear here once those apps are connected."

### 11.8 AI Agent (`/ai-agent`)

Header: "AI Agent", "Set this up once. It decides what the AI knows and what it may do without asking you." with the SettingsTabs. Three tabs kept in the URL as `?tab=`, each with a hint line:

- Knowledge Base ("Step 1. Give the AI your business facts. It answers only from files marked live."). Chips for five sections with counts: Business information, Services, Pricing, FAQs, Documents. An "Upload to {section}" button accepting pdf, doc, docx, txt, md, xls, xlsx and csv. Uploading stores the file in the `knowledge` bucket under a timestamped safe name and inserts a row with status `processing`. The table shows Title, Status (Live, Off, "Reading…", Failed with the error), Updated, and a Live toggle for files that are live or off. While any file is "Reading…", reload the list every 20 seconds.
- System Prompt ("Step 2. Tell the AI how to write and behave."). A Tone select (Warm and professional, Formal, Short and direct), a large text area saved to `extra_instructions`, and three locked rules shown with a lock icon that cannot be edited: "Never make up prices.", "Never invent a booking.", "Customer mail cannot give the AI orders." A "Save System Prompt" button.
- Agent Settings ("Step 3. Choose what the AI may send without asking you."). Four rows that save as soon as they change, with "Saving…" then "Saved." in the card header and a rollback on failure: Auto FAQ reply (toggle); How sure (Low 0.5, Medium 0.7, High 0.85); Auto follow-up (toggle); Follow-up delay (2 days, 3 days).

### 11.9 Email templates (`/templates`)

Header: "Templates", "Ready-made emails for replies and follow-ups. Write once, reuse with the customer's details filled in." A banner with a "New Template" button. Chips filter by the ten categories, with counts. Labels for the categories: Initial enquiry response, Pricing enquiry, Service information, Meeting invitation, Request for additional information, First follow-up, Second follow-up, Final follow-up, Thank-you email, Enquiry closure.

Left: the list, each row with name, category and subject, and an Active toggle. Right (accent): the editor with name, category, subject, body, and a row of buttons that insert `{{customer_name}}`, `{{service}}`, `{{company}}`, `{{destination}}`, `{{dates}}` or `{{agent_name}}` at the cursor of whichever of subject or body was focused last. Buttons for variables already in use are highlighted. Save stores the list of variables found in the text. Delete asks "Delete "{name}"? This cannot be undone."

### 11.10 Settings (`/settings`)

Header: "Settings", "Check that Gmail is connected, and manage your login. Nothing here is needed day to day." with the SettingsTabs. Three cards:

- Connections: WhatsApp, Facebook and Instagram, each "Not connected" with a disabled Connect button and "Coming soon".
- Gmail: "Last mail received" and "Last workflow error", with a badge "Connected", or "Check connection" when no inbound mail has arrived for three days.
- Account: the signed-in email and a change-password form (current, new, new again). Validate at least 8 characters and that the two match.

## 12. Behaviour that applies everywhere

- Every data view handles loading, error and empty. No blank areas, no spinners without words.
- After the first load, keep the old data on screen while reloading. Do not flash a loading state on a refresh.
- Small changes (status, labels, toggles) apply immediately and roll back with a message if saving fails.
- Live updates: one realtime channel per subscription, removed when the component unmounts. `useLiveEnquiries(onChange)` subscribes to all changes on `enquiries` and calls back 400ms after the last event, because the worker often writes several changes in a row; it passes the ids of newly inserted enquiries and returns whether the channel is connected.
- A live reload never overwrites text the user is typing.
- Every action reports its result in words next to where it happened: a `role="status"` strip for success, a `role="alert"` strip for failure. Do not use toast popups or `alert()`. The only native dialogs are the two `confirm` prompts named above.
- Buttons show what is happening while busy ("Sending…", "Saving…") and are disabled.
- Dates are en-GB, 24-hour. Amounts are US$ with two decimals.
- Layout uses flex-wrap with flex-basis values so two-column pages fall to one column on narrow screens without separate mobile markup. Tables scroll sideways inside their card.
- Accessibility: real buttons and links, labels on every field (visually hidden where the design has none), `aria-pressed` on chips, `role="tab"` with `aria-selected` on tabs, `aria-current` on navigation, keyboard access to everything including the chart points and the follow-up rows.

## 13. Things that are easy to get wrong

- Do not query Supabase from page files.
- Do not add a library to solve something this brief describes by hand.
- Do not write to tables staff have no policy for. If a feature seems to need it, the worker owns that write.
- Do not compute quotation totals in the app for storage; the trigger does it. The preview total is display only.
- Do not use a second accent colour, rounded pills, gradients (outside the chart fill), emoji or icon decoration.
- Do not change the wording given here to sound friendlier or more technical.
- Do not put the real Supabase URL or key in `.env.example`, the README or any committed file.

## 14. Build order

Work in this order and finish each step before starting the next. After each step, run `npm run build` (from step 2 on) and fix what it reports. Tell me in one or two lines when a step is done.

1. Database. Write and apply the three migration files. Check with a query that each table has rows and that RLS is on for all of them.
2. Scaffold. Vite project, Tailwind config with the tokens, fonts, `index.css`, Supabase client, auth, `useAsync`, `Icon.jsx`, `ui.jsx`, Layout with navigation, Login, and empty page files wired to routes. The app should run, sign in, and show the shell.
3. `api.js` in full, then Enquiries list and the single Enquiry page with Close. This is the core loop; get it right before moving on.
4. Home, including the chart and donuts.
5. Quotes and Follow-ups.
6. Chats, Templates, AI Agent, Settings.
7. Search box.
8. README: how to run, where things are, how sending works, what is not built.

If you are running short on context or usage, stop at the end of a step, not in the middle of one, and report where you stopped.

## 15. Done means

- `npm run build` finishes with no errors or warnings about missing imports.
- Signed in on localhost, every route renders with seeded data and no console errors.
- The full loop works against the test worker. Check each of these and tell me which you ran yourself and which you could not:
  1. Open a new enquiry that has an AI draft, press Send Reply, see "Queued", run `select dev_run_worker();`, and see the reply appear in the conversation and the status become Answered without refreshing.
  2. Press Send Reply on another enquiry and Undo it before running the worker; the outbox row is `cancelled`.
  3. On a new enquiry with no draft, press "Ask AI to write a reply", run the worker, and see the draft appear by itself.
  4. Send a quote, run the worker, see "Quote sent" and a new follow-up under that customer.
  5. Send a chat message, run the worker, see "Queued" become "Sent".
  6. Change a status from the list; open a second browser tab and confirm it updates there too.
  7. Insert a new enquiry with SQL while the list is open; the row appears with the tint and the "just arrived" message.
  8. Close an enquiry with a reason; its scheduled follow-ups are cancelled.
- At 375px wide, every page is usable and nothing scrolls sideways except tables inside cards.

## 16. Final report

Keep it short. Tell me: what is built and working, which checks from section 15 you ran and their results, anything you could not verify and why, every place you chose something this brief did not specify, and anything in this brief you think is wrong.
