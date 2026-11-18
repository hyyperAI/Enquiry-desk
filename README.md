# Enquiry Desk (Jetwing Travels)

Staff web app for handling travel enquiries: read the AI's draft and send it, build and send quotes, follow up, chat with customers from every app, and manage what the AI knows.

React 18 + Vite + Tailwind CSS 3 + React Router 6, connected to the **jetwing** Supabase project.

## Run it
1. Install Node 18 or newer.
2. In this folder:
   ```
   npm install
   cp .env.example .env      # already filled in with the jetwing project URL and public key
   npm run dev
   ```
3. Open the address it prints and sign in with a Supabase user.
   To add staff: Supabase dashboard → Authentication → Users → Add user (email + password).

Build for hosting: `npm run build` creates `dist/`. Host it on Vercel, Netlify or any static host, and set the same `VITE_` variables there.

## Where things are
- `src/lib/api.js` – every database read and write. Start here to change behaviour.
- `src/lib/auth.jsx` – sign in, sign out, change password.
- `src/components/ui.jsx` – shared pieces (header, 5-step strip, banner, card, table, buttons, toggles, loading/error states).
- `src/pages/` – one file per page.
- `tailwind.config.js` – EXOPAI colours and fonts (`exo-*`, `font-head`, `font-body`).
- `supabase/migrations/` – the tables this app added (already applied).
- `docs/n8n-outbox.md` – what n8n must do so the Send buttons actually send.

## How sending works
The app never sends mail or messages directly. Send buttons write a row to the `outbox` table (status `queued`), and an n8n workflow sends it through Gmail / WhatsApp / Facebook and marks it `sent` or `failed`. Follow-ups use your existing follow-up workflow. **Until the outbox workflow in `docs/n8n-outbox.md` exists, replies, quotes and chat messages stay queued.**

## Database
Uses your existing tables (enquiries, contacts, travel_details, email_messages, followups, quotations, quotation_items, knowledge_documents, agent_settings, activity_logs, notifications) under their existing security rules. Added, without changing anything existing: `outbox`, `conversations`, `conversation_messages`.

## Not done yet
- The n8n outbox sender and the WhatsApp / Facebook / Instagram connections (see `docs/n8n-outbox.md`).
- Staff roles: every signed-in user can see and do everything.
