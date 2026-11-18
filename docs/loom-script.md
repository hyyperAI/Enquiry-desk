# Loom script: Enquiry Desk walkthrough

**Audience:** Jetwing Travels staff, seeing the app for the first time. Internal only.
**Length:** about 5 minutes (roughly 650 spoken words).
**Story:** follow one enquiry through the 5 steps: Enquiry in → Send reply → Send quote → Follow up → Close.

---

## Before you press record

### Must work, or the demo breaks
- [ ] `npm run dev` is running and the app opens at `http://localhost:5173`.
- [ ] You are already signed in. Do not show the login screen or type a password on camera.
- [ ] A **test enquiry sent from an address you own** is in the list, status **New**, with an **AI draft reply** on it. Send it 10 minutes before recording, written like a real customer: place, dates, number of people, one missing detail (e.g. no room type) so the "Add the question" button appears.
- [ ] That test enquiry is the **first row in "Needs You Now"** on Home. If it is not, open it from Enquiries instead and change the line in scene 2.
- [ ] The n8n **outbox replies workflow is imported and switched on** (`docs/n8n-outbox.md`). Without it, Send Reply only queues and no email arrives. If it is not on, cut scene 4b.
- [ ] Your test inbox is open in a second tab, showing the original thread, ready to show the reply landing.
- [ ] One follow-up exists in **Scheduled** or **Due now** with AI text in it (send a quote to the test enquiry the day before, or schedule one by hand).
- [ ] AI Agent → Knowledge Base has at least one file with status **Live**.

### Decide before recording
- [ ] **Quotes do not send yet.** Send Quote saves and queues, but the n8n part that makes the PDF and emails it is not built. The script says so. Do not claim the customer receives it.
- [ ] **Chats is empty** until WhatsApp, Facebook and Instagram are connected. The script gives it one sentence and does not open it. Open it only if you have seeded test conversations.
- [ ] **Real customer names and emails show on Home and Enquiries.** Fine for an internal video. Set the Loom link to **Jetwing workspace only**, not "anyone with the link".
- [ ] **Use the test enquiry, not a real customer**, for scenes 3 to 7. Scene 4 sends a real email and scene 7 closes the enquiry.

### Screen and sound
- [ ] Browser at 100% zoom, window about 1440 wide, bookmarks bar hidden, all other tabs closed.
- [ ] Notifications off (Windows Focus Assist, WhatsApp, Slack, mail).
- [ ] Loom: screen + camera bubble bottom-left (bottom-right covers the Send buttons). Test mic for 10 seconds.
- [ ] Quote values written on a sticky note so you do not think while typing: `Cinnamon Citadel Kandy, 3 nights, double room` / `540`, `Airport transfer` / `90`.
- [ ] Do one full dry run. Then reset the test enquiry to New (or send a fresh one) before the real take.

---

## Script

Read the right column aloud. Do the left column **while** speaking that row, not before. Pause one second after every click.

### 1. Opening (0:00 – 0:25)

| On screen | You say |
|---|---|
| Home page, nothing moving. Mouse still. | "This is Enquiry Desk. It is where your team answers every travel enquiry, from first email to booked or lost." |
| Move the mouse slowly along the 5-step strip, left to right. | "Every enquiry goes through the same five steps: it comes in, you reply, you send a quote, you follow up, you close it. I will take one enquiry through all five." |

### 2. Home (0:25 – 1:00)

| On screen | You say |
|---|---|
| Point at the four number cards. | "Home is your work for today. How many need a reply, how many follow-ups are due, how many are scheduled, how many are answered." |
| Point at the "Needs You Now" table, then its last column. | "Below that is the list that needs you now. The last column tells you what to do next, so nobody has to work it out." |
| Scroll down to the chart and the three donuts. Hover one point on the chart. Scroll back up. | "Further down you see enquiries in against replies out, and where enquiries come from and what kind of trip they are." |
| Click **Open First Enquiry**. | "I will open the first one." |

### 3. Read the enquiry (1:00 – 1:40)

| On screen | You say |
|---|---|
| Enquiry page loads. Point at the name, then the 3-step strip (Reply, Send quote, Follow up). | "This is one customer. The same three steps sit at the top of every page for them." |
| Point at **AI summary**, then **Trip details**. | "The AI has already read the email. Here is the summary, and here are the trip details it pulled out: place, dates, how many people." |
| Point at the missing detail and click **Add the question**. | "It also shows what the customer did not tell us. One click adds that question to the reply." |
| Scroll to **Conversation**. | "This is the full email thread, so you never need to open Gmail to check." |

### 4. Send the reply (1:40 – 2:25)

| On screen | You say |
|---|---|
| Scroll to the reply box with the AI draft. | "The AI has already written the reply. Your job is to check it." |
| Click into the text, change one phrase (e.g. add the customer's first name or one sentence). | "You can change anything. I will add one line." |
| Point at **Who writes the reply** toggle. Do not switch it. | "If you would rather write it yourself, switch here." |
| Click **Send Reply**. Wait for the **Reply queued** notice. | "I press Send Reply. It is queued and goes out within a minute, from your own Gmail, inside the same thread." |
| **4b.** Switch to the inbox tab, show the reply in the thread. Switch back. | "Here it is in the customer's inbox, as a normal reply." |

### 5. Send a quote (2:25 – 3:25)

| On screen | You say |
|---|---|
| Click **Make Quote**. Quote page opens with the customer filled in. | "They asked for prices, so step two is the quote. The customer's details are already filled in." |
| Type item 1 and amount. Click **Add Item**, type item 2 and amount. | "I add the hotel and the transfer." |
| Move the mouse to the right panel while the total and the amount in words update. | "On the right is exactly what the customer gets. It updates as I type, with the total and the amount in words." |
| Scroll to **Payment details**, point, do not edit. | "Bank details are filled in once and reused." |
| Click **Send Quote**. Point at the notice. | "Send Quote saves it and schedules a follow-up automatically. The step that turns this into a PDF and emails it is the next piece we are connecting, so today it is saved and queued." |

### 6. Follow up (3:25 – 4:05)

| On screen | You say |
|---|---|
| Click **Follow-ups** in the sidebar. Point at the six number cards. | "Step three. Most bookings are lost because nobody chased. Here you see what is due, what went out, and how many customers replied after a follow-up." |
| Click a row in **Due now** or **Scheduled**. The AI text shows on the right. | "Two days after a quote, a reminder is written for you. Pick the customer, read it." |
| Point at **Send Follow-up**, **Move Date**, **Cancel It**. Do not click. | "Send it now, move the date, or cancel it. If the customer replies first, it cancels itself." |

### 7. Close (4:05 – 4:25)

| On screen | You say |
|---|---|
| Go back to the test enquiry (browser Back or Enquiries → the row). Click **Close Enquiry**. | "Last step. When it is finished, you close it." |
| Point at the five reasons. Select **Booked with us**. Click **Close Enquiry**. | "You pick why: booked, went elsewhere, no reply. That is how you learn where bookings are won and lost." |

### 8. Set up once (4:25 – 4:50)

| On screen | You say |
|---|---|
| Click **AI Agent**. Show Knowledge Base with the Live file. | "This part is set up once. You upload your hotel and package details, and the AI answers from those." |
| Click the **Agent Settings** section. Point at the Auto FAQ reply toggle. | "And you decide what it may do alone. With this off, the AI only drafts and a person always presses send." |
| Click **Templates**. Hold for two seconds. | "Templates are your ready-made emails." |

### 9. Close out (4:50 – 5:10)

| On screen | You say |
|---|---|
| Click **Home**. Mouse still. | "Email works today. WhatsApp, Facebook and Instagram will land in the Chats page once those accounts are connected." |
| Stay on Home. | "So: the AI reads and drafts, you check and send, and nothing is forgotten. Start each day on Home and work down the list. If something looks wrong or is missing, tell me and I will fix it." |

---

## If something goes wrong mid-take
- **No AI draft on the enquiry:** stop and re-record. Do not improvise around it; it is the main point of the demo.
- **Reply stays queued and no email arrives:** skip 4b, say "it goes out within a minute", and keep going.
- **A red error box appears:** stop. Fix it, then record again from the start of that scene. Loom lets you trim, not patch.
