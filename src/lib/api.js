// All database access for the app. Pages import from here only.
// Every function throws on error, so pages can show one error state.
//
// How sending works: the app never sends mail or messages itself.
// It writes a row to `outbox` (status 'queued'); an n8n workflow picks it up,
// sends through Gmail / WhatsApp / Facebook, and marks it 'sent' or 'failed'.
// Follow-ups use the existing followups table: "send now" sets due_at to now,
// and the existing n8n follow-up workflow sends it.

import { supabase } from './supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

// ---------- display helpers ----------

// The database allows only 5 statuses (n8n depends on them). The 6 labels staff
// see are derived from them without changing the database:
//   new                           -> New
//   quotation_sent                -> Answered (we replied / sent the quote, waiting on the customer)
//   research_in_progress          -> In progress
//   followup_due                  -> Follow-up
//   closed as booking_confirmed   -> Resolved
//   closed for any other reason   -> Closed
export const STATUS_FILTERS = ['All', 'New', 'Answered', 'In progress', 'Follow-up', 'Resolved', 'Closed'];
const STATUS_LABEL = { new: 'New', quotation_sent: 'Answered', research_in_progress: 'In progress', followup_due: 'Follow-up' };

/** Display status for an enquiry row (needs status and closed_reason). */
export function statusLabel(e) {
  if (e.status === 'closed') return e.closed_reason === 'booking_confirmed' ? 'Resolved' : 'Closed';
  return STATUS_LABEL[e.status] || e.status;
}

/**
 * Change an enquiry's status from the list, using the staff label.
 * 'Closed' is not handled here: it needs a reason, so the list sends staff to the close page.
 * Moving away from closed clears closed_reason/closed_at (the database requires that).
 */
export async function setEnquiryStatus(id, label) {
  const open = { closed_reason: null, closed_at: null };
  let patch;
  if (label === 'New') patch = { status: 'new', ...open };
  else if (label === 'Answered') patch = { status: 'quotation_sent', ...open };
  else if (label === 'In progress') patch = { status: 'research_in_progress', ...open };
  else if (label === 'Follow-up') patch = { status: 'followup_due', ...open };
  else if (label === 'Resolved') patch = { status: 'closed', closed_reason: 'booking_confirmed', closed_at: new Date().toISOString() };
  else throw new Error(`Cannot set status "${label}" from here.`);
  ok(await supabase.from('enquiries').update(patch).eq('id', id));
  if (label === 'Resolved') {
    ok(await supabase.from('followups').update({ status: 'cancelled', cancelled_reason: 'enquiry_closed' }).eq('enquiry_id', id).in('status', ['scheduled', 'due']));
  }
}

/** What staff should do next, and where. */
export function nextStep(e) {
  switch (e.status) {
    case 'new': return { label: 'Send reply', to: `/enquiries/${e.id}`, act: true };
    case 'research_in_progress': return { label: 'Send quote', to: `/enquiries/${e.id}/quote`, act: true };
    case 'followup_due': return { label: 'Follow up', to: `/enquiries/${e.id}/follow-up`, act: true };
    case 'quotation_sent': return { label: 'Wait for customer', act: false };
    default: return { label: 'Nothing to do', act: false };
  }
}

export function when(ts) {
  if (!ts) return '';
  const d = new Date(ts); const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `Today ${hm}`;
  if (diff === 1) return `Yesterday ${hm}`;
  if (diff === -1) return `Tomorrow ${hm}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` ${hm}`;
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

/** Trip facts row from travel_details. Missing values say "Not given". */
export function tripFacts(t) {
  const people = t && (t.adults != null || t.children != null)
    ? [t.adults ? `${t.adults} adult${t.adults > 1 ? 's' : ''}` : null, t.children ? `${t.children} child${t.children > 1 ? 'ren' : ''}` : null].filter(Boolean).join(', ')
    : null;
  const dates = t?.check_in || t?.check_out ? `${fmtDate(t.check_in) || '?'} to ${fmtDate(t.check_out) || '?'}` : null;
  const budget = t?.budget_amount != null ? `${t.budget_currency || 'USD'} ${Number(t.budget_amount).toLocaleString()}` : null;
  return [
    { k: 'Place', v: t?.destination }, { k: 'Dates', v: dates }, { k: 'People', v: people },
    { k: 'Rooms', v: t?.room_requirements }, { k: 'Budget', v: budget }, { k: 'Extra', v: t?.special_requests },
  ].map((f) => ({ ...f, v: f.v || 'Not given', missing: !f.v }));
}

// ---------- home ----------

/** Time buckets for the Home chart: last 14 days, last 12 weeks (Monday start), or last 12 months. */
function buckets(range) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = [];
  if (range === 'month') {
    for (let i = 11; i >= 0; i--) {
      const s = new Date(today.getFullYear(), today.getMonth() - i, 1);
      out.push({ start: s, end: new Date(s.getFullYear(), s.getMonth() + 1, 1), label: s.toLocaleDateString('en-GB', { month: 'short' }) });
    }
  } else if (range === 'week') {
    const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    for (let i = 11; i >= 0; i--) {
      const s = new Date(monday); s.setDate(monday.getDate() - i * 7);
      const e = new Date(s); e.setDate(s.getDate() + 7);
      out.push({ start: s, end: e, label: s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
    }
  } else {
    for (let i = 13; i >= 0; i--) {
      const s = new Date(today); s.setDate(today.getDate() - i);
      const e = new Date(s); e.setDate(s.getDate() + 1);
      out.push({ start: s, end: e, label: s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
    }
  }
  return out;
}

/** range: 'day' | 'week' | 'month' (the chart's grouping). */
export async function getHome(range = 'day') {
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const [all, mails, fups, convs] = await Promise.all([
    supabase.from('enquiries').select('id,status,closed_reason,flags,subject,category,travel_type,gmail_thread_id,created_at,updated_at,contacts(full_name,email)').order('updated_at', { ascending: false }).then(ok),
    supabase.from('email_messages').select('enquiry_id,direction,status,message_at,created_at').in('status', ['received', 'sent']).then(ok),
    supabase.from('followups').select('status,due_at').in('status', ['scheduled', 'due', 'processing']).then(ok),
    supabase.from('conversations').select('channel,created_at').then(ok),
  ]);
  const enq = all.filter((e) => e.status !== 'closed');
  // Latest received/sent mail per enquiry decides whether it still needs a reply.
  const latest = {}, answered = new Set();
  for (const m of mails) {
    const at = new Date(m.message_at || m.created_at).getTime();
    if (m.direction === 'outbound' && m.status === 'sent') answered.add(m.enquiry_id);
    if (!latest[m.enquiry_id] || at > latest[m.enquiry_id].at) latest[m.enquiry_id] = { at, inbound: m.direction === 'inbound' };
  }
  const needsReply = enq.filter((e) => !latest[e.id] || latest[e.id].inbound).length;
  const dueBy = endToday.getTime();
  // Chart: enquiries in vs replies out (emails we actually sent), per bucket.
  const replyTimes = mails.filter((m) => m.direction === 'outbound' && m.status === 'sent').map((m) => new Date(m.message_at || m.created_at));
  const inB = (b) => (d) => d >= b.start && d < b.end;
  const days = buckets(range).map((b) => ({
    day: b.label,
    enquiries: all.filter((e) => inB(b)(new Date(e.created_at))).length,
    replies: replyTimes.filter(inB(b)).length,
  }));
  return {
    counts: {
      total: all.length,
      newEnquiries: all.filter((e) => statusLabel(e) === 'New').length,
      needReplies: needsReply,
      followUps: fups.filter((f) => new Date(f.due_at).getTime() > dueBy).length,
      answered: all.filter((e) => answered.has(e.id)).length,
      followUpsDue: fups.filter((f) => new Date(f.due_at).getTime() <= dueBy).length,
    },
    needsYou: enq.filter((e) => nextStep(e).act).slice(0, 6).map(toRow),
    chart: days,
    analytics: enquiryAnalytics(all, convs),
  };
}

const CATEGORY_LABEL = { general: 'General', service: 'Service', booking: 'Booking', support: 'Support' };
const TRAVEL_LABEL = { hotel: 'Hotel', package: 'Package', tour: 'Tour', corporate: 'Corporate', unknown: 'Not sure' };

/** Counts for the Home analytics: totals by period, by category, by trip type, by source. */
function enquiryAnalytics(all, convs) {
  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startDay); startWeek.setDate(startDay.getDate() - ((startDay.getDay() + 6) % 7)); // Monday
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const since = (d) => all.filter((e) => new Date(e.created_at) >= d).length;
  const tally = (rows, key, labels) => {
    const out = {};
    for (const r of rows) { const k = labels[key(r)] || key(r) || 'Not set'; out[k] = (out[k] || 0) + 1; }
    return Object.entries(out).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  };
  // Email enquiries come in through Gmail. Chats come from the conversations table, by app.
  const sources = [{ label: 'Email', n: all.length }, ...tally(convs, (c) => c.channel, { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', email: 'Email chat' })]
    .filter((s) => s.n > 0 || s.label === 'Email');
  return {
    periods: [{ label: 'Today', n: since(startDay) }, { label: 'This week', n: since(startWeek) }, { label: 'This month', n: since(startMonth) }],
    byCategory: tally(all, (e) => e.category, CATEGORY_LABEL),
    byTravel: tally(all, (e) => e.travel_type, TRAVEL_LABEL),
    bySource: sources,
  };
}

// ---------- enquiries ----------

function toRow(e) {
  return {
    id: e.id,
    name: e.contacts?.full_name || e.contacts?.email || 'Unknown',
    email: e.contacts?.email,
    subject: e.subject || '(no subject)',
    status: statusLabel(e),
    rawStatus: e.status,
    next: nextStep(e),
    received: when(e.created_at),
    createdAt: e.created_at,
    summary: e.summary || '',
    // No assignment column exists yet; every enquiry is shared by the team.
    agent: 'Unassigned',
  };
}

const ROW_COLS = 'id,status,closed_reason,flags,subject,summary,created_at,updated_at,contacts(full_name,email)';

/** filter: one of STATUS_FILTERS. search: free text. Newest first. */
export async function listEnquiries({ filter = 'All', search = '' } = {}) {
  const rows = ok(await supabase.from('enquiries').select(ROW_COLS).order('created_at', { ascending: false }).limit(500)).map(toRow);
  const s = search.trim().toLowerCase();
  return rows.filter((r) => (filter === 'All' || r.status === filter)
    && (!s || [r.name, r.email, r.subject, r.summary].some((x) => x && x.toLowerCase().includes(s))));
}

/**
 * Live updates for enquiries (new mail filed by n8n, status changes by anyone).
 * onStatus gets true once connected. Returns an unsubscribe function.
 */
export function subscribeEnquiries(onChange, onStatus) {
  const ch = supabase.channel(`enquiries-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'enquiries' }, onChange)
    .subscribe((s) => onStatus?.(s === 'SUBSCRIBED'));
  return () => supabase.removeChannel(ch);
}

/** Summary and trip facts for one enquiry, for the search box preview. */
export async function peekEnquiry(id) {
  const e = ok(await supabase.from('enquiries').select('id,summary,travel_details(*)').eq('id', id).single());
  const travel = Array.isArray(e.travel_details) ? e.travel_details[0] : e.travel_details;
  return { summary: e.summary, facts: tripFacts(travel) };
}

export async function countByStatus() {
  const rows = ok(await supabase.from('enquiries').select('status,closed_reason,flags'));
  const out = { All: rows.length };
  for (const label of STATUS_FILTERS.slice(1)) out[label] = rows.filter((r) => statusLabel(r) === label).length;
  return out;
}

// ---------- conversation thread ----------

/** HTML email -> readable plain text (AI drafts and quote emails are stored as HTML only). */
export function htmlToText(html = '') {
  if (!html) return '';
  const marked = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr|table|blockquote)\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '• ');
  const doc = new DOMParser().parseFromString(marked, 'text/html');
  doc.querySelectorAll('style,script,head').forEach((n) => n.remove());
  return (doc.body?.textContent || '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
const mailText = (r) => (r.body_text && r.body_text.trim()) ? r.body_text : htmlToText(r.body_html);

// "On Mon, Nov 16, 2026 at 9:36 PM Name <a@b.com> wrote:" (Gmail style, may wrap onto 2 lines)
const QUOTE_HEAD = /\n\s*On ([\s\S]{5,160}?) wrote:\s*\n/;
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60);

/** Split an email body into what was newly written and the older mail it quotes. */
export function splitQuoted(text = '') {
  const t = '\n' + text.replace(/\r/g, '');
  const m = t.match(QUOTE_HEAD);
  if (!m) return { own: text.trim(), quoted: null };
  const rest = t.slice(m.index + m[0].length);
  const quoted = rest.split('\n').map((l) => l.replace(/^\s*>\s?/, '')).join('\n').trim();
  const head = m[1].replace(/\s+/g, ' ');
  const parts = head.match(/^(.*?\d{1,2}:\d{2}(?:\s?[AP]M)?)\s+(.+?)\s*(?:<[^>]*>)?$/i);
  return {
    own: t.slice(0, m.index).trim(), quoted,
    quotedFrom: parts?.[2], quotedAt: (parts?.[1] || head).replace(/\s+at\s+/, ', '),
  };
}

/** Mail rows -> chat-style thread, oldest first. Quoted older mail we don't have as its own row becomes its own bubble. */
function toThread(rows) {
  const out = [];
  const seen = new Set();
  const sorted = [...rows].sort((a, b) => new Date(a.message_at || a.created_at) - new Date(b.message_at || b.created_at));
  for (const r of sorted) seen.add(squash(splitQuoted(mailText(r)).own));
  for (const r of sorted) {
    const inbound = r.direction === 'inbound';
    const { own, quoted, quotedFrom, quotedAt } = splitQuoted(mailText(r));
    if (quoted && !seen.has(squash(splitQuoted(quoted).own))) {
      seen.add(squash(splitQuoted(quoted).own));
      out.push({ id: `${r.id}-q`, inbound, from: quotedFrom || (inbound ? r.sender_name || 'Customer' : 'Jetwing Travels'), time: quotedAt, text: splitQuoted(quoted).own });
    }
    out.push({
      id: r.id, inbound,
      from: inbound ? (r.sender_name || r.sender || 'Customer') : 'Jetwing Travels',
      time: when(r.message_at || r.created_at), text: own || mailText(r),
      tag: r.send_type === 'quotation' ? 'Quote, PDF attached' : r.send_type === 'auto_followup' ? 'Follow-up' : null,
    });
  }
  return out;
}

export async function getEnquiry(id) {
  const [e, msgs, logs, outbox, drafts] = await Promise.all([
    supabase.from('enquiries').select('*,contacts(*),travel_details(*)').eq('id', id).single().then(ok),
    supabase.from('email_messages').select('id,direction,status,sender,sender_name,subject,body_text,body_html,send_type,message_at,created_at,ai_generated,gmail_draft_id,draft_meta')
      .eq('enquiry_id', id).neq('status', 'discarded').order('created_at', { ascending: false }).then(ok),
    supabase.from('activity_logs').select('id,action,actor,details,created_at').eq('enquiry_id', id).order('created_at', { ascending: false }).limit(30).then(ok),
    supabase.from('outbox').select('id,kind,status,subject,last_error,created_at').eq('enquiry_id', id).order('created_at', { ascending: false }).then(ok),
    supabase.from('draft_requests').select('id,status,last_error,created_at').eq('enquiry_id', id).order('created_at', { ascending: false }).limit(1).then(ok),
  ]);
  const travel = Array.isArray(e.travel_details) ? e.travel_details[0] : e.travel_details;
  const draft = msgs.find((m) => m.direction === 'outbound' && m.status === 'draft') || null;
  const sources = draft?.draft_meta?.sources || draft?.draft_meta?.facts_used || [];
  return {
    id: e.id,
    rawStatus: e.status,
    status: statusLabel(e),
    name: e.contacts?.full_name || e.contacts?.email || 'Unknown',
    email: e.contacts?.email,
    contactId: e.contact_id,
    contact: { name: e.contacts?.full_name || '', email: e.contacts?.email || '', phone: e.contacts?.phone || '', notes: e.contacts?.notes || '' },
    travel: travel ? { destination: travel.destination || '', check_in: travel.check_in || '', check_out: travel.check_out || '', adults: travel.adults ?? '', children: travel.children ?? '', room_requirements: travel.room_requirements || '', budget_amount: travel.budget_amount ?? '', budget_currency: travel.budget_currency || 'USD', special_requests: travel.special_requests || '' } : {},
    customer: [
      { k: 'Name', v: e.contacts?.full_name }, { k: 'Email', v: e.contacts?.email }, { k: 'Phone', v: e.contacts?.phone },
      { k: 'Customer since', v: fmtDate(e.contacts?.created_at) }, { k: 'Received', v: when(e.created_at) }, { k: 'Assigned agent', v: 'Unassigned' },
    ].map((f) => ({ ...f, v: f.v || 'Not given', missing: !f.v })),
    subject: e.subject || '(no subject)',
    summary: e.summary,
    facts: tripFacts(travel),
    // Values for {{variables}} in email templates. agent_name is added by the page (the signed-in user).
    vars: {
      customer_name: e.contacts?.full_name || '',
      service: e.travel_type && e.travel_type !== 'unknown' ? (TRAVEL_LABEL[e.travel_type] || e.travel_type).toLowerCase() : '',
      destination: travel?.destination || '',
      dates: travel?.check_in || travel?.check_out ? `${fmtDate(travel.check_in) || '?'} to ${fmtDate(travel.check_out) || '?'}` : '',
    },
    messages: toThread(msgs.filter((m) => m.status === 'received' || m.status === 'sent')),
    draft: draft && { id: draft.id, subject: draft.subject || `Re: ${e.subject || ''}`, body: mailText(draft), gmailDraftId: draft.gmail_draft_id, sources: Array.isArray(sources) ? sources : [String(sources)] },
    draftRequest: drafts[0] || null,
    pendingReply: outbox.find((o) => o.kind === 'reply' && (o.status === 'queued' || o.status === 'processing')) || null,
    history: [
      ...outbox.map((o) => ({ at: o.created_at, time: when(o.created_at), who: 'You', text: `${o.kind === 'reply' ? 'Reply' : o.kind === 'quotation' ? 'Quote' : 'Message'} ${o.status === 'queued' ? 'queued to send' : o.status}${o.last_error ? `: ${o.last_error}` : ''}.` })),
      ...logs.map((l) => ({ at: l.created_at, time: when(l.created_at), who: l.actor === 'n8n' || l.actor === 'ai' ? 'AI' : 'Staff', text: l.action.replace(/_/g, ' ') + '.' })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)),
  };
}

/** Ask n8n to write an AI reply for this enquiry (workflow 04). Only one open request per enquiry. */
export async function requestAiDraft(enquiryId) {
  const { data, error } = await supabase.from('draft_requests').insert({ enquiry_id: enquiryId }).select('id,status,last_error,created_at').single();
  if (error?.code === '23505') throw new Error('The AI is already writing a reply for this enquiry.');
  if (error) throw error;
  return data;
}

/** Live updates when n8n finishes (or fails) an AI draft request for this enquiry. Returns an unsubscribe function. */
export function subscribeDraftRequests(enquiryId, onChange) {
  const ch = supabase.channel(`drafts-${enquiryId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'draft_requests', filter: `enquiry_id=eq.${enquiryId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}

export async function sendReply(enquiry, body, subject) {
  return ok(await supabase.from('outbox').insert({
    kind: 'reply', channel: 'email', enquiry_id: enquiry.id, email_message_id: enquiry.draft?.id || null,
    to_address: enquiry.email, subject: subject?.trim() || enquiry.draft?.subject || `Re: ${enquiry.subject}`, body,
  }).select().single());
}

/** Undo only works while n8n has not picked it up yet. */
export async function cancelOutbox(id) {
  const rows = ok(await supabase.from('outbox').update({ status: 'cancelled' }).eq('id', id).eq('status', 'queued').select());
  if (!rows.length) throw new Error('Too late to undo: it is already being sent.');
}

/** Live updates when n8n sends (or fails to send) something queued for this enquiry. Returns an unsubscribe function. */
export function subscribeOutbox(enquiryId, onChange) {
  const ch = supabase.channel(`outbox-${enquiryId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'outbox', filter: `enquiry_id=eq.${enquiryId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}

export const gmailDraftUrl =(draftId) => (draftId ? `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}` : 'https://mail.google.com/mail/u/0/#drafts');

export const CLOSE_REASONS = [
  { label: 'Booked with us', value: 'booking_confirmed' },
  { label: 'Customer chose another company', value: 'customer_declined' },
  { label: 'No reply from customer', value: 'no_response' },
  { label: 'Not a fit for us', value: 'not_suitable' },
  { label: 'Duplicate enquiry', value: 'duplicate' },
];

export async function closeEnquiry(id, reason, note) {
  const cur = ok(await supabase.from('enquiries').select('flags').eq('id', id).single());
  const flags = note ? { ...(cur.flags || {}), close_note: note } : cur.flags;
  ok(await supabase.from('enquiries').update({ status: 'closed', closed_reason: reason, closed_at: new Date().toISOString(), flags }).eq('id', id));
  ok(await supabase.from('followups').update({ status: 'cancelled', cancelled_reason: 'enquiry_closed' }).eq('enquiry_id', id).in('status', ['scheduled', 'due']));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Find the enquiry a quote is for, by enquiry ID or customer email. Prefers the newest open one. Returns null if none. */
export async function findEnquiry(term) {
  const t = term.trim();
  if (!t) return null;
  const cols = 'id,subject,status,updated_at,contacts!inner(full_name,email)';
  let q = supabase.from('enquiries').select(cols);
  q = UUID.test(t) ? q.eq('id', t) : q.ilike('contacts.email', t);
  const rows = ok(await q.order('updated_at', { ascending: false }).limit(20));
  const e = rows.find((r) => r.status !== 'closed') || rows[0];
  return e ? { id: e.id, name: e.contacts?.full_name || e.contacts?.email || 'Unknown', email: e.contacts?.email || '', subject: e.subject || '' } : null;
}

export async function searchCustomers(term) {
  const t = term.trim();
  if (!t) return [];
  const rows = ok(await supabase.from('contacts').select('id,full_name,email,phone')
    .or(`full_name.ilike.%${t}%,email.ilike.%${t}%`).limit(8));
  const results = [];
  for (const c of rows) {
    const enq = ok(await supabase.from('enquiries').select('id,subject,status')
      .eq('contact_id', c.id).order('updated_at', { ascending: false }).limit(1));
    const e = enq[0];
    results.push({ contactId: c.id, name: c.full_name || '', email: c.email, phone: c.phone || '', enquiryId: e?.id || null, subject: e?.subject || '' });
  }
  return results;
}

export async function createManualEnquiry(email, name, subject) {
  const { data, error } = await supabase.rpc('jw_app_manual_enquiry', { p_email: email, p_name: name || '', p_subject: subject || 'Manual quotation' });
  if (error) throw new Error(error.message);
  return data;
}

export async function getEnquiryHeader(id) {
  const e = ok(await supabase.from('enquiries').select('id,subject,status,closed_reason,contacts(full_name,email)').eq('id', id).single());
  return {
    id: e.id, name: e.contacts?.full_name || e.contacts?.email || 'Unknown', email: e.contacts?.email || '', subject: e.subject || '',
    rawStatus: e.status, status: statusLabel(e),
  };
}

// ---------- edit enquiry details ----------

export async function updateContact(contactId, patch) {
  const allowed = {};
  if (patch.name !== undefined) allowed.full_name = patch.name.trim();
  if (patch.email !== undefined) {
    const e = patch.email.trim();
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Enter a valid email address.');
    allowed.email = e;
  }
  if (patch.phone !== undefined) allowed.phone = patch.phone.trim();
  if (patch.notes !== undefined) allowed.notes = patch.notes.trim();
  ok(await supabase.from('contacts').update(allowed).eq('id', contactId));
}

export async function updateEnquirySummary(id, summary) {
  ok(await supabase.from('enquiries').update({ summary: summary.trim() }).eq('id', id));
}

export async function updateTravelDetails(enquiryId, patch) {
  const row = { enquiry_id: enquiryId };
  for (const [k, v] of Object.entries(patch)) {
    if (v === '' || v === null || v === undefined) row[k] = null;
    else if (['adults', 'children', 'budget_amount'].includes(k)) row[k] = Number(v) || null;
    else row[k] = String(v).trim();
  }
  ok(await supabase.from('travel_details').upsert(row, { onConflict: 'enquiry_id' }));
}

// ---------- follow-ups ----------

export const FOLLOWUP_TABS = ['Due now', 'Scheduled', 'Sent'];

/** enquiryId (optional) limits the list to one customer's enquiry. */
export async function listFollowUps(tab, enquiryId) {
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  let q = supabase.from('followups').select('id,enquiry_id,due_at,status,message_body,sent_at,last_error,enquiries(subject,contacts(full_name,email))');
  if (enquiryId) q = q.eq('enquiry_id', enquiryId);
  if (tab === 'Due now') q = q.in('status', ['scheduled', 'due']).lte('due_at', endToday.toISOString()).order('due_at');
  else if (tab === 'Scheduled') q = q.eq('status', 'scheduled').gt('due_at', endToday.toISOString()).order('due_at');
  else q = q.eq('status', 'sent').order('sent_at', { ascending: false }).limit(50);
  return ok(await q).map((f) => ({
    id: f.id, enquiryId: f.enquiry_id, status: f.status,
    name: f.enquiries?.contacts?.full_name || f.enquiries?.contacts?.email || 'Unknown',
    quote: f.enquiries?.subject || '', due: when(f.status === 'sent' ? f.sent_at : f.due_at), dueAt: f.due_at,
    subject: `Re: ${f.enquiries?.subject || 'your quote'}`,
    body: f.message_body || '',
    lastError: f.last_error,
  }));
}

export async function followUpCounts(enquiryId) {
  const res = await Promise.all(FOLLOWUP_TABS.map((t) => listFollowUps(t, enquiryId)));
  return Object.fromEntries(FOLLOWUP_TABS.map((t, i) => [t, res[i].length]));
}

/** Empty body means the AI writes it when it goes out. */
export const sendFollowUpNow = async (id, body) =>
  ok(await supabase.from('followups').update({ due_at: new Date().toISOString(), message_body: body || null, status: 'scheduled', last_error: null }).eq('id', id).in('status', ['scheduled', 'due', 'failed']).select());
export const moveFollowUp = async (id, dueAt) =>
  ok(await supabase.from('followups').update({ due_at: new Date(dueAt).toISOString(), status: 'scheduled', last_error: null }).eq('id', id).in('status', ['scheduled', 'due', 'failed']));
/** Staff can schedule a follow-up for any enquiry; no quote needed. n8n sends it when due. */
export async function scheduleFollowUp(enquiryId, dueAt, body) {
  const { data, error } = await supabase.from('followups').insert({
    enquiry_id: enquiryId, due_at: new Date(dueAt).toISOString(), message_body: body?.trim() || null, status: 'scheduled', source: 'staff',
  }).select().single();
  if (error?.code === '23505') throw new Error('This customer already has a follow-up. Move or send that one instead.');
  if (error) throw error;
  return data;
}

/** Numbers for the Follow-ups insights row. enquiryId (optional) limits to one customer. */
export async function followUpInsights(enquiryId) {
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const month = Date.now() - 30 * 86400000;
  let fq = supabase.from('followups').select('enquiry_id,status,due_at,sent_at,created_at');
  let mq = supabase.from('email_messages').select('enquiry_id,message_at,created_at').eq('direction', 'inbound');
  if (enquiryId) { fq = fq.eq('enquiry_id', enquiryId); mq = mq.eq('enquiry_id', enquiryId); }
  const [fups, inbound] = await Promise.all([fq.then(ok), mq.then(ok)]);
  const open = fups.filter((f) => f.status === 'scheduled' || f.status === 'due');
  const sent = fups.filter((f) => f.status === 'sent' && f.sent_at);
  const replied = sent.filter((f) => inbound.some((m) => m.enquiry_id === f.enquiry_id && new Date(m.message_at || m.created_at) > new Date(f.sent_at)));
  const waits = sent.map((f) => (new Date(f.sent_at) - new Date(f.created_at)) / 86400000).filter((d) => d >= 0);
  return {
    due: open.filter((f) => new Date(f.due_at) <= endToday).length,
    scheduled: open.filter((f) => new Date(f.due_at) > endToday).length,
    sent30: sent.filter((f) => new Date(f.sent_at).getTime() >= month).length,
    failed: fups.filter((f) => f.status === 'failed').length,
    replied: replied.length,
    replyRate: sent.length ? Math.round((replied.length / sent.length) * 100) : null,
    avgDays: waits.length ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10 : null,
  };
}

export const cancelFollowUp = async (id) =>
  ok(await supabase.from('followups').update({ status: 'cancelled', cancelled_reason: 'staff_cancelled' }).eq('id', id));

// ---------- quotes ----------

export async function listOpenEnquiries() {
  return ok(await supabase.from('enquiries').select('id,subject,contacts(full_name,email)').neq('status', 'closed').order('updated_at', { ascending: false }).limit(200))
    .map((e) => ({ id: e.id, label: `${e.contacts?.full_name || e.contacts?.email || 'Unknown'}, ${e.subject || '(no subject)'}`, name: e.contacts?.full_name || '', email: e.contacts?.email || '' }));
}

/** Prefill the quote form from an enquiry. */
export async function quotePrefill(enquiryId) {
  const e = ok(await supabase.from('enquiries').select('id,subject,contacts(full_name,email),travel_details(*)').eq('id', enquiryId).single());
  const t = Array.isArray(e.travel_details) ? e.travel_details[0] : e.travel_details;
  const range = t?.check_in && t?.check_out ? ` from ${fmtDate(t.check_in)} to ${fmtDate(t.check_out)}` : '';
  return {
    person: e.contacts?.full_name || '', company: '', address: e.contacts?.email || '',
    title: `Being cost of accommodation and transport arrangement in ${t?.destination || 'Sri Lanka'}${range}`,
    recipients: [e.contacts?.email].filter(Boolean),
  };
}

/** The newest quote queued for this enquiry (any status), or null. Used to stop a quote being sent twice by accident. */
export async function latestQuoteOutbox(enquiryId) {
  const rows = ok(await supabase.from('outbox').select('id,status,last_error,quotations(version)')
    .eq('enquiry_id', enquiryId).eq('kind', 'quotation').neq('status', 'cancelled')
    .order('created_at', { ascending: false }).limit(1));
  const r = rows[0];
  return r ? { id: r.id, status: r.status, last_error: r.last_error, version: r.quotations?.version || null } : null;
}

/** Saves the quote and queues it for n8n to approve, make the PDF and send. */
export async function sendQuote(enquiryId, form, toEmail) {
  const num = (x) => parseFloat(String(x).replace(/[^0-9.]/g, '')) || 0;
  const prev = ok(await supabase.from('quotations').select('version').eq('enquiry_id', enquiryId).order('version', { ascending: false }).limit(1));
  const version = (prev[0]?.version || 0) + 1;
  const items = form.lines.filter((l) => l.desc.trim()).map((l, i) => ({ position: i + 1, description: l.desc.trim(), quantity: 1, unit_price: num(l.amt), total_price: num(l.amt), is_bank_charge: false }));
  if (num(form.bank) > 0) items.push({ position: items.length + 1, description: 'Bank charges', quantity: 1, unit_price: num(form.bank), total_price: num(form.bank), is_bank_charge: true });
  if (!items.length) throw new Error('Add at least one item.');
  // The n8n PDF reads: name, trip_description, company, address, email, phone, prepared_by.
  const [enq, me] = await Promise.all([
    supabase.from('enquiries').select('contacts(phone)').eq('id', enquiryId).single().then(ok),
    supabase.auth.getUser(),
  ]);
  const user = me.data?.user;
  const q = ok(await supabase.from('quotations').insert({
    enquiry_id: enquiryId, quotation_number: form.ref || `QT-${Date.now()}`, version, currency: form.currency || 'USD',
    // subtotal/total are not sent: staff may not write them; jw_approve_quotation computes them from the items.
    taxes: 0, status: 'pending_approval',
    customer_block: {
      name: form.person, company: form.company, address: form.address,
      trip_description: form.title, heading: form.title, date: form.date, note: form.note,
      email: toEmail, phone: enq?.contacts?.phone || '',
      prepared_by: user?.user_metadata?.full_name || user?.email || '',
      ...(form.emailSubject && { email_subject: form.emailSubject }),
      ...(form.emailBody && { email_body: form.emailBody }),
    },
    payment_details: [form.benef && `Beneficiary: ${form.benef}`, form.bankname && `Bank: ${form.bankname}`, form.acct && `Account no: ${form.acct}`].filter(Boolean).join('\n'),
  }).select().single());
  ok(await supabase.from('quotation_items').insert(items.map((i) => ({ ...i, quotation_id: q.id }))));
  const emailSubject = form.emailSubject?.trim() || `Your quotation ${q.quotation_number}`;
  const outbox = ok(await supabase.from('outbox').insert({ kind: 'quotation', channel: 'email', enquiry_id: enquiryId, quotation_id: q.id, to_address: toEmail, subject: emailSubject }).select('id,status,last_error').single());
  return { ...q, outbox: { ...outbox, version: q.version } };
}

export async function listQuotesForContact(email) {
  if (!email) return [];
  const rows = ok(await supabase.from('quotations')
    .select('id,quotation_number,version,currency,status,created_at,pdf_path,customer_block,enquiries!inner(id,subject,contacts!inner(email))')
    .ilike('enquiries.contacts.email', email)
    .order('created_at', { ascending: false }).limit(20));
  return rows.map((q) => ({
    id: q.id, number: q.quotation_number, version: q.version, currency: q.currency,
    total: q.customer_block?.total, status: q.status, sentAt: q.created_at,
    pdfPath: q.pdf_path, subject: q.enquiries?.subject || '',
  }));
}

// ---------- chats ----------

export const CHAT_LABELS = ['New', 'Needs quote', 'Quote sent', 'Follow-up due', 'Honeymoon', 'Family', 'Group', 'VIP', 'Booked', 'Closed'];
export const CHAT_APPS = [
  { name: 'All', value: null }, { name: 'WhatsApp', value: 'whatsapp' }, { name: 'Facebook', value: 'facebook' },
  { name: 'Instagram', value: 'instagram' }, { name: 'Email', value: 'email' },
];
export const appName = (v) => CHAT_APPS.find((a) => a.value === v)?.name || v;

export async function listConversations() {
  const rows = ok(await supabase.from('conversations')
    .select('id,channel,customer_name,contact_handle,enquiry_id,labels,facts,ai_suggestion,unread_count,last_message_at,conversation_messages(body,direction,created_at)')
    .order('last_message_at', { ascending: false })
    .order('created_at', { referencedTable: 'conversation_messages', ascending: false })
    .limit(1, { referencedTable: 'conversation_messages' }));
  return rows.map((c) => ({ ...c, last: c.conversation_messages?.[0] || null, app: appName(c.channel), time: when(c.last_message_at) }));
}

export const listMessages = async (conversationId) =>
  ok(await supabase.from('conversation_messages').select('id,direction,body,status,created_at').eq('conversation_id', conversationId).order('created_at'));

export const markRead = async (id) => ok(await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id));
export const setLabels = async (id, labels) => ok(await supabase.from('conversations').update({ labels }).eq('id', id));

export async function sendChatMessage(conv, body, userId) {
  const msg = ok(await supabase.from('conversation_messages').insert({ conversation_id: conv.id, direction: 'outbound', body, status: 'queued', created_by: userId }).select().single());
  ok(await supabase.from('outbox').insert({ kind: 'chat', channel: conv.channel, conversation_id: conv.id, enquiry_id: conv.enquiry_id, to_address: conv.contact_handle, body }));
  return msg;
}

/** Live updates for the chat inbox. Returns an unsubscribe function. */
export function subscribeChats(onChange) {
  const ch = supabase.channel('chats')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_messages' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// ---------- AI agent ----------

export const CONFIDENCE = { Low: 0.5, Medium: 0.7, High: 0.85 };
export const confidenceLabel = (v) => (v >= 0.85 ? 'High' : v >= 0.7 ? 'Medium' : 'Low');

export const getAgentSettings = async () => ok(await supabase.from('agent_settings').select('*').eq('id', 1).single());
export const saveAgentSettings = async (patch) => ok(await supabase.from('agent_settings').update(patch).eq('id', 1).select().single());

// Knowledge sections. The database allows doc_type company/services/terms/faq only,
// so Pricing is stored as 'services' with a "Pricing: " title prefix, and
// Documents is stored as 'terms'.
const PRICING_PREFIX = 'Pricing: ';
export const KB_SECTIONS = [
  { key: 'business', label: 'Business information', docType: 'company', hint: 'Who you are, contacts, opening hours.' },
  { key: 'services', label: 'Services', docType: 'services', hint: 'Tours, packages, hotels you offer.' },
  { key: 'pricing', label: 'Pricing', docType: 'services', prefix: PRICING_PREFIX, hint: 'Rate sheets and price lists.' },
  { key: 'faqs', label: 'FAQs', docType: 'faq', hint: 'Common questions and answers.' },
  { key: 'documents', label: 'Documents', docType: 'terms', hint: 'Terms, policies and other files.' },
];
export function kbSection(d) {
  if (d.doc_type === 'services') return d.title?.startsWith(PRICING_PREFIX) ? 'pricing' : 'services';
  return KB_SECTIONS.find((s) => s.docType === d.doc_type)?.key || 'documents';
}
export const kbTitle = (d) => (d.title?.startsWith(PRICING_PREFIX) ? d.title.slice(PRICING_PREFIX.length) : d.title);

export const listKnowledge = async () =>
  ok(await supabase.from('knowledge_documents').select('id,title,doc_type,status,error,updated_at').order('updated_at', { ascending: false }));
export const setKnowledgeLive = async (id, live) =>
  ok(await supabase.from('knowledge_documents').update({ status: live ? 'live' : 'off' }).eq('id', id));

/** Uploads to the knowledge bucket. n8n reads it, makes it searchable, then sets it live. */
const MIME_BY_EXT = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown' };

export async function uploadKnowledge(file, sectionKey) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const mime = file.type || MIME_BY_EXT[ext];
  if (!mime) throw new Error('Only PDF, TXT and MD files are supported.');
  const section = KB_SECTIONS.find((s) => s.key === sectionKey) || KB_SECTIONS[4];
  const path = `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
  const up = await supabase.storage.from('knowledge').upload(path, file, { contentType: mime });
  if (up.error) throw up.error;
  return ok(await supabase.from('knowledge_documents').insert({ title: (section.prefix || '') + file.name, doc_type: section.docType, storage_path: path, mime_type: mime, status: 'processing' }).select().single());
}

export const retryKnowledge = async (id) =>
  ok(await supabase.from('knowledge_documents').update({ status: 'processing', error: null }).eq('id', id));

export const mcpInfo = { url: import.meta.env.VITE_MCP_URL || '', tools: ['Read mail', 'Search mail', 'Make draft'] };

// ---------- settings ----------

export async function getGmailStatus() {
  const [lastIn, lastErr] = await Promise.all([
    supabase.from('email_messages').select('created_at').eq('direction', 'inbound').order('created_at', { ascending: false }).limit(1).then(ok),
    supabase.from('notifications').select('created_at').eq('type', 'workflow_error').order('created_at', { ascending: false }).limit(1).then(ok),
  ]);
  const last = lastIn[0]?.created_at;
  const stale = !last || Date.now() - new Date(last).getTime() > 3 * 86400000;
  return { lastMail: last ? when(last) : 'No mail yet', lastError: lastErr[0] ? when(lastErr[0].created_at) : 'None', looksConnected: !stale };
}

// ---------- templates ----------

export const TEMPLATE_CATEGORIES = [
  { label: 'Initial enquiry response', value: 'initial_response' },
  { label: 'Pricing enquiry', value: 'pricing' },
  { label: 'Service information', value: 'service_info' },
  { label: 'Meeting invitation', value: 'meeting_invite' },
  { label: 'Request for additional information', value: 'more_info' },
  { label: 'First follow-up', value: 'followup_1' },
  { label: 'Second follow-up', value: 'followup_2' },
  { label: 'Final follow-up', value: 'followup_final' },
  { label: 'Thank-you email', value: 'thank_you' },
  { label: 'Enquiry closure', value: 'closure' },
];
export const templateCategoryLabel = (v) => TEMPLATE_CATEGORIES.find((c) => c.value === v)?.label || v;
export const TEMPLATE_VARIABLES = ['customer_name', 'service', 'destination', 'dates', 'agent_name'];

/** Fill {{name}} placeholders. Unknown or empty values are left as {{name}} so staff can see what to fill in. */
export const fillTemplate = (text = '', vars = {}) =>
  text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] ? String(vars[k]) : `{{${k}}}`));

/** {{name}} placeholders used in a subject/body, in order, no repeats. */
export const templateVars = (...texts) => [...new Set(texts.join(' ').match(/\{\{\s*(\w+)\s*\}\}/g)?.map((m) => m.replace(/[{}\s]/g, '')) || [])];

export const listTemplates = async () =>
  ok(await supabase.from('email_templates').select('*').order('category').order('name'));

export async function saveTemplate(t) {
  const row = { name: t.name.trim(), category: t.category, subject: t.subject, body: t.body, variables: templateVars(t.subject, t.body), is_active: t.is_active };
  if (!row.name) throw new Error('Give the template a name.');
  const q = t.id ? supabase.from('email_templates').update(row).eq('id', t.id) : supabase.from('email_templates').insert(row);
  return ok(await q.select().single());
}
export const deleteTemplate = async (id) => ok(await supabase.from('email_templates').delete().eq('id', id));
export const setTemplateActive = async (id, active) => ok(await supabase.from('email_templates').update({ is_active: active }).eq('id', id));
