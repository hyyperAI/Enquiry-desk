# Jetwing Enquiry Desk – n8n workflows (exported 2026-11-19)

14 workflows from the live n8n instance. Import each JSON via n8n > Workflows > Import from File.
All are exported with `active: false`.

| # | Workflow | Trigger |
|---|----------|---------|
| 00 | Error handler | Error Trigger |
| 01 | Process inbound mail | Gmail (every minute) |
| 02 | Store attachments | sub-workflow (called by 01) |
| 03 | Classify and extract email | sub-workflow (called by 01) |
| 04 | Draft reply | sub-workflow (called by 01) |
| 05 | Send email | sub-workflow (called by 04, 06, 07, 08, 11, 12) |
| 06 | API send reply | Webhook POST /jetwing/send-reply |
| 07 | API send quotation | Webhook POST /jetwing/send-quotation |
| 08 | Process follow-ups | Schedule (every 2 min) |
| 09 | API index knowledge | Webhook POST /jetwing/index-knowledge |
| 10 | Schedule follow-up | sub-workflow (called by 06, 07) |
| 11 | API send follow-up | Webhook POST /jetwing/send-followup |
| 12 | Outbox sender | Schedule (every minute) |
| 13 | Knowledge indexer | Schedule (every 2 min) |

## Importing into another n8n instance
- Credentials are referenced by id/name only (no secrets). Re-create and re-link:
  Postgres, Gmail OAuth2, Supabase API, OpenRouter, HTTP Header Auth (webhook auth + Voyage), Api2Pdf.
- Sub-workflow calls (Execute Workflow nodes) point at the original workflow ids. After import,
  re-select the target workflow in each Execute Workflow node.
- 12 and 13 call 07 and 09 by their production webhook URL on the original host; update those URLs.
- Set 00 as the Error Workflow in each workflow's settings if you want alerts.
