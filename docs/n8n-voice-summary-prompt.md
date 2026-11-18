# n8n prompt: Voice Agents call summary webhook

Paste this to your n8n agent.

---

Create a new workflow **"14 API voice call summary"**.

1. **Webhook** node: POST, path `voice-summary`, respond "Using 'Respond to Webhook' node". Allow CORS for the app origin (Options → Allowed Origins: `*` for the demo, or the app URL).
   Body: `{ "conversation_id": "conv_..." }`
2. **IF** `conversation_id` is empty or does not start with `conv_` → Respond 400 `{ "error": "conversation_id required" }`.
3. **HTTP Request**: GET `https://api.elevenlabs.io/v1/convai/conversations/{{ $json.body.conversation_id }}`
   Header `xi-api-key` from an n8n credential (Header Auth). Never return the key.
4. **Respond to Webhook** (JSON), status 200:
   ```
   {
     "status": "{{ $json.status === 'done' ? 'done' : 'processing' }}",
     "summary": "{{ $json.analysis?.transcript_summary || '' }}",
     "data_collection": { key: value for each entry in $json.analysis.data_collection_results }
   }
   ```
   Use a Code node before the response to build `data_collection` as a flat object: `{ [key]: entry.value }`.
   Only allow the two agent IDs (`agent_9001m7pjdfczfadsvcbfwdpxdz89`, `agent_6501m7pzmfq3ecfb44jjmnp9f4bt`): if `$json.agent_id` is another agent, respond 403.

Activate it, then put the production URL in the app's `.env`:

```
VITE_ELEVENLABS_SUMMARY_URL=https://exopai890.app.n8n.cloud/webhook/voice-summary
```

The app polls it every 5 s (up to 1 min) after a call ends, until `status` is `done`.

## ElevenLabs settings (both agents)
- Security → authentication **off** (public), so the browser can start the call with the agent ID. Add the app's domain to the allowlist.
- Analysis → **Data collection**: add the fields to show (Mandy: travel_dates, travellers, hotel_type, budget, special_requests. Sophie: hotel_name, dates_available, rooms_available, nightly_rate, notes).
