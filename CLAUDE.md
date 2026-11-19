# CLAUDE.md

## Context lookup: graph first

A knowledge graph of this project exists at `graphify-out/graph.json` (summary in `graphify-out/GRAPH_REPORT.md`).

- Before reading source files to answer a question about this codebase, query the graph first: `graphify query "<question>"` (add `--budget 1500` to cap output). Use `graphify path "A" "B"` or `graphify explain "X"` for targeted lookups.
- Only open raw files when the graph doesn't cover it, or when you need exact lines to edit. Use the graph's `source_location` to read just that part.
- For a single known symbol ("where is X defined"), a plain Grep is fine.
- After meaningful code or doc changes, run `/graphify --update` so the graph stays current.

## Database (Supabase project `jetwing`, ref `dzygyxxwkgjyirsnhrdr`)

The graph includes the live database: every table, foreign key, trigger, RPC function and the realtime publication, plus links from each `src/lib/api.js` function to the tables and RPCs it touches. Graph node labels are `table <name>` and `db function <name>()`.

- **Schema questions** ("what columns does X have", "what references enquiries", "which RPC does n8n call for Y"): query the graph, e.g. `graphify explain "table outbox"` or `graphify path "sendQuote()" "table quotations"`. For exact columns, read the table's section in `docs/db-schema.md`. Do not run SQL against the database just to look up schema.
- **"What code touches table X"**: `graphify query "table X"`. Every app read and write goes through `src/lib/api.js`, so no other file needs searching.
- **Ground rules for this database:**
  - RLS is on for every table. Signed-in staff can only do what the policies in `docs/db-schema.md` allow. Before adding a write from the app, confirm a matching policy exists; if not, add it in a migration.
  - The app never sends mail or messages. It inserts a `queued` row into `outbox`, and n8n claims it with `jw_app_claim_reply_outbox`, then `jw_app_finish_reply_outbox` / `jw_app_fail_outbox`.
  - Realtime is on for `enquiries`, `outbox`, `conversations`, `conversation_messages` and `draft_requests` only. Subscriptions to any other table will not fire.
  - `quotations` and `quotation_items` have freeze triggers (`jw_freeze_quotation`, `jw_freeze_items`). Expect edits to sent quotes to be rejected.
  - Legacy tables `enquiries1`, `leads`, `emails`, `chat_messages` and `voice_calls` have no policies and are not used by the app. Don't build on them.
  - Schema changes go in `supabase/migrations/<date>_<name>.sql`. Never change the live schema by hand.
- **After any migration:** regenerate `docs/db-schema.md` from the live database, run `& (Get-Content graphify-out/.graphify_python) scripts/graph_db_schema.py`, then `/graphify --update`. Until then, the graph shows the old schema.
