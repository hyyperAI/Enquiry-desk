import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EnquiryHeader, NextBanner, Card, Badge, Button, Kbd, SentNotice, Segmented, Field, Loading, ErrorState, Empty, textareaCls, inputCls, cx } from '../components/ui';
import { Icon } from '../components/Icon.jsx';
import { useAsync } from '../lib/useAsync';
import { getEnquiry, sendReply, cancelOutbox, gmailDraftUrl, subscribeOutbox, requestAiDraft, subscribeDraftRequests, listTemplates, fillTemplate, templateVars, TEMPLATE_CATEGORIES, updateContact, updateEnquirySummary, updateTravelDetails } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';

// One job on this page: answer the customer.
// Top: the trip at a glance. Middle: the conversation, with the reply box right under it
// (read down, then answer). Side: the AI's summary, who the customer is, and what has happened.

const MODES = ['Use AI reply', 'Write it myself'];
const label = 'text-[11px] font-semibold uppercase tracking-wider';

// How to ask for each missing trip fact in a reply.
const ASK = { place: 'preferred destination', dates: 'travel dates', people: 'number of travellers', rooms: 'room requirements', budget: 'budget' };
// A sign-off is a line holding only the closing words ("Kind regards,"), so "Thank you for your enquiry…" is not one.
const SIGN_OFF = /\n\s*\n[ \t]*(best regards|kind regards|warm regards|regards|many thanks|thanks|thank you|sincerely|yours sincerely|yours faithfully)[,.!]?[ \t]*(\n[\s\S]*)?$/i;

const list = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

function EditableSummary({ summary, chasing, first, enquiryId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(summary || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(summary || ''); }, [summary]);

  const save = async () => {
    if (text === (summary || '')) { setEditing(false); return; }
    setSaving(true);
    try { await updateEnquirySummary(enquiryId, text); onSaved(); setEditing(false); }
    catch { /* keep editing */ }
    finally { setSaving(false); }
  };

  return (
    <section aria-label="AI summary" className="rounded-card border border-jw-border border-l-[3px] border-l-jw-olive-deep bg-white px-5 py-4">
      <span className={cx(label, 'mb-1.5 flex items-center justify-between gap-1.5 text-jw-olive-deep')}>
        <span className="flex items-center gap-1.5"><Icon name="spark" size={12} />AI summary</span>
        {!editing && <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-semibold text-jw-olive-deep underline">Edit</button>}
      </span>
      {chasing && <p className="m-0 mb-1.5 font-semibold text-jw-ink">{first} is following up on an earlier request that has no reply yet.</p>}
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea className={textareaCls} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="primary" onClick={save} disabled={saving} className="text-xs">{saving ? 'Saving…' : 'Save'}</Button>
            <Button onClick={() => { setText(summary || ''); setEditing(false); }} className="text-xs">Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="m-0 text-[15px] leading-relaxed text-jw-ink">{summary || 'The AI has not summarised this enquiry yet.'}</p>
      )}
    </section>
  );
}

function EditableCustomer({ contact, contactId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (contact) setForm({ name: contact.name || '', email: contact.email || '', phone: contact.phone || '', notes: contact.notes || '' }); }, [contact]);

  const save = async () => {
    setErr(''); setSaving(true);
    try { await updateContact(contactId, form); onSaved(); setEditing(false); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (!contact) return null;

  return (
    <Card title="Customer" right={!editing && <button type="button" onClick={() => setEditing(true)} className={cx(label, 'text-jw-olive-deep underline')}>Edit</button>}>
      {editing ? (
        <div className="flex flex-col gap-3 px-5 py-3">
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Email"><input className={inputCls} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
          <Field label="Notes"><textarea className={textareaCls} rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
          {err && <p className="m-0 text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <Button variant="primary" onClick={save} disabled={saving} className="text-xs">{saving ? 'Saving…' : 'Save'}</Button>
            <Button onClick={() => { setForm({ name: contact.name || '', email: contact.email || '', phone: contact.phone || '', notes: contact.notes || '' }); setEditing(false); setErr(''); }} className="text-xs">Cancel</Button>
          </div>
        </div>
      ) : (
        <dl className="m-0 flex flex-col px-5 py-2">
          {[{ k: 'Name', v: contact.name }, { k: 'Email', v: contact.email }, { k: 'Phone', v: contact.phone }, { k: 'Notes', v: contact.notes }]
            .map((f) => (
              <div key={f.k} className="flex items-baseline justify-between gap-4 border-b border-jw-line py-2 last:border-b-0">
                <dt className={cx(label, 'flex-none text-jw-gray')}>{f.k}</dt>
                <dd className={cx('m-0 min-w-0 break-words text-right', f.v ? 'font-semibold text-jw-ink' : 'text-jw-mid-gray')}>{f.v || '—'}</dd>
              </div>
            ))}
        </dl>
      )}
    </Card>
  );
}

const TRAVEL_FIELDS = [
  { key: 'destination', label: 'Destination', type: 'text' },
  { key: 'check_in', label: 'Check in', type: 'date' },
  { key: 'check_out', label: 'Check out', type: 'date' },
  { key: 'adults', label: 'Adults', type: 'number' },
  { key: 'children', label: 'Children', type: 'number' },
  { key: 'room_requirements', label: 'Rooms', type: 'text' },
  { key: 'budget_amount', label: 'Budget', type: 'number' },
  { key: 'budget_currency', label: 'Currency', type: 'select', options: ['USD', 'LKR'] },
  { key: 'special_requests', label: 'Special requests', type: 'text' },
];

function EditableTravel({ travel, enquiryId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (travel) setForm({ ...travel }); }, [travel]);

  const save = async () => {
    setSaving(true);
    try { await updateTravelDetails(enquiryId, form); onSaved(); setEditing(false); }
    catch { /* keep editing */ }
    finally { setSaving(false); }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card title="Travel details" right={!editing && <button type="button" onClick={() => setEditing(true)} className={cx(label, 'text-jw-olive-deep underline')}>Edit</button>}>
      {editing ? (
        <div className="flex flex-col gap-3 px-5 py-3">
          {TRAVEL_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === 'select' ? (
                <select className={inputCls} value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input className={inputCls} type={f.type} value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
              )}
            </Field>
          ))}
          <div className="flex gap-2">
            <Button variant="primary" onClick={save} disabled={saving} className="text-xs">{saving ? 'Saving…' : 'Save'}</Button>
            <Button onClick={() => { setForm({ ...travel }); setEditing(false); }} className="text-xs">Cancel</Button>
          </div>
        </div>
      ) : (
        <dl className="m-0 flex flex-col px-5 py-2">
          {TRAVEL_FIELDS.map((f) => {
            const v = travel?.[f.key];
            const display = v != null && v !== '' ? String(v) : null;
            return (
              <div key={f.key} className="flex items-baseline justify-between gap-4 border-b border-jw-line py-2 last:border-b-0">
                <dt className={cx(label, 'flex-none text-jw-gray')}>{f.label}</dt>
                <dd className={cx('m-0 min-w-0 break-words text-right', display ? 'font-semibold text-jw-ink' : 'text-jw-mid-gray')}>{display || '—'}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
}

/** Adds a question about the missing facts, above the sign-off if the reply has one. */
function withQuestion(text, missing) {
  const q = `Could you also let us know your ${list(missing.map((k) => ASK[k] || k))}? That will help us put together the right options for you.`;
  const m = text.match(SIGN_OFF);
  if (!m) return `${text.trimEnd()}${text.trim() ? '\n\n' : ''}${q}`;
  return `${text.slice(0, m.index).trimEnd()}\n\n${q}${text.slice(m.index)}`;
}

export default function Enquiry({ enquiryId: propId, embedded } = {}) {
  const { id: paramId } = useParams();
  const id = propId || paramId;
  const { data: d, error, loading, reload } = useAsync(() => getEnquiry(id), [id]);
  const [mode, setMode] = useState(MODES[0]);
  const [mine, setMine] = useState('');
  const [aiText, setAiText] = useState('');
  const [queued, setQueued] = useState(null); // outbox row
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [asked, setAsked] = useState(false);
  const threadRef = useRef(null);
  const { user } = useAuth();
  const templates = useAsync(() => listTemplates(), []);
  const [subject, setSubject] = useState('');
  const [tplNote, setTplNote] = useState('');

  useEffect(() => {
    if (!d) return;
    setQueued(d.pendingReply);
  }, [d]);
  // Subject: start from the AI draft's subject (or "Re: ..."). Only reset when the enquiry or draft changes, so staff edits survive live reloads.
  const draftId = d?.draft?.id;
  const baseSubject = d ? (d.draft?.subject || `Re: ${d.subject}`) : '';
  // Same for the AI text and the mode, so a live reload never wipes what staff typed.
  const loaded = !!d;
  useEffect(() => {
    if (!d) return;
    setSubject(baseSubject);
    setAiText(d.draft?.body || '');
    setMode(d.draft ? MODES[0] : MODES[1]);
  }, [id, draftId, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAsked(false); setMine(''); setTplNote(''); }, [id]);

  // When n8n sends the queued reply (or fails), show it without a refresh.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => subscribeOutbox(id, (p) => {
    if (p.new?.status === 'sent') { setMine(''); setAsked(false); }
    reloadRef.current();
  }), [id]);
  // When n8n finishes writing an AI reply we asked for, show it without a refresh.
  useEffect(() => subscribeDraftRequests(id, () => reloadRef.current()), [id]);

  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');
  const askAi = async () => {
    setAsking(true); setAskError('');
    try { await requestAiDraft(id); await reload(); }
    catch (e) { setAskError(e.message); }
    setAsking(false);
  };

  // Open on the newest message, like any chat.
  const messageCount = d?.messages.length || 0;
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount, id]);

  if (loading && !d) return <Loading what="Loading enquiry" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const first = d.name.split(' ')[0];
  const closed = d.rawStatus === 'closed';
  const useAi = mode === MODES[0];
  const body = useAi ? aiText : mine;
  const setBody = useAi ? setAiText : setMine;
  // Customer wrote again before we answered: the last two messages are both theirs.
  const tail = d.messages.slice(-2);
  const chasing = !closed && tail.length === 2 && tail.every((m) => m.inbound);
  const missing = d.facts.filter((f) => f.missing && f.k !== 'Extra').map((f) => f.k.toLowerCase());
  const canWrite = !queued && !closed && !(useAi && !d.draft);

  // Template placeholders still not filled (e.g. {{dates}} when the customer has not given dates).
  const unfilled = templateVars(subject, body);
  const activeTemplates = (templates.data || []).filter((t) => t.is_active);

  const applyTemplate = (tplId) => {
    const t = activeTemplates.find((x) => x.id === tplId);
    if (!t) return;
    if (body.trim() && !window.confirm(`Replace your reply with the template "${t.name}"?`)) return;
    const vars = { ...d.vars, agent_name: user?.user_metadata?.full_name || '' };
    setMine(fillTemplate(t.body, vars));
    if (t.subject?.trim()) setSubject(fillTemplate(t.subject, vars));
    setMode(MODES[1]);
    setAsked(false);
    setTplNote(t.name);
  };

  const send = async () => {
    if (busy || queued || !body.trim()) return;
    if (!subject.trim()) { setActionError('Add a subject before sending.'); return; }
    if (unfilled.length) { setActionError(`Fill in ${list(unfilled.map((v) => `{{${v}}}`))} before sending.`); return; }
    setBusy(true); setActionError('');
    try { setQueued(await sendReply(d, body.trim(), subject.trim())); reload(); }
    catch (e) { setActionError(e.message); }
    setBusy(false);
  };
  const undo = async () => {
    setBusy(true); setActionError('');
    try { await cancelOutbox(queued.id); setQueued(null); reload(); }
    catch (e) { setActionError(e.message); }
    setBusy(false);
  };
  const onKey = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
  const askMissing = () => { setBody(withQuestion(body, missing)); setAsked(true); };

  let banner;
  if (closed) banner = <NextBanner role="status" label="Closed" text="This enquiry is closed. Nothing to do." />;
  else if (queued) banner = <NextBanner role="status" label="Reply queued" text={`Your reply to ${first} goes out within a few minutes. When ${first} answers, make the quote.`}
    action={<Button variant="primary" to={`/enquiries/${id}/quote`}>Make Quote</Button>} />;
  else if (d.draft) banner = <NextBanner label="What to do now" text="The AI already wrote a reply under the conversation. Check it, change anything, press Send." />;
  else banner = <NextBanner label="What to do now" text={`Read what ${first} wants, then write your reply under the conversation and press Send.`} />;

  return (
    <>
      {!embedded && <EnquiryHeader e={d} step={1} done={!!queued} />}
      {banner}

      {/* ---------- the trip at a glance ---------- */}
      <dl aria-label="Trip details" className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {d.facts.map((f) => (
          <div key={f.k} className={cx('flex min-w-0 flex-col gap-1 rounded-card border px-4 py-3', f.missing ? 'border-dashed border-jw-border bg-transparent' : 'border-jw-border bg-white')}>
            <dt className={cx(label, f.missing ? 'text-jw-mid-gray' : 'text-jw-olive-deep')}>{f.k}</dt>
            <dd title={f.missing ? undefined : f.v} className={cx('m-0 line-clamp-2 break-words leading-snug', f.missing ? 'text-jw-mid-gray' : 'font-semibold text-jw-ink')}>{f.v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-start gap-4">
        {/* ---------- middle: read, then answer ---------- */}
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <Card title="Conversation" subtitle={d.messages.length ? `${d.messages.length} ${d.messages.length === 1 ? 'message' : 'messages'}, oldest first` : undefined}
            right={chasing && <Badge tone="ink">Waiting on us</Badge>}>
            {d.messages.length === 0 ? <Empty>No messages yet.</Empty> : (
              <ol ref={threadRef} className="m-0 flex max-h-[440px] list-none flex-col gap-4 overflow-y-auto bg-jw-offwhite px-5 py-5">
                {d.messages.map((m, i) => {
                  const who = m.inbound ? m.from : 'You';
                  return (
                    <li key={m.id} className={cx('flex max-w-[88%] items-end gap-2.5', m.inbound ? 'self-start' : 'flex-row-reverse self-end')}>
                      <span aria-hidden="true" className={cx('inline-flex h-8 w-8 flex-none items-center justify-center font-head text-sm font-semibold',
                        m.inbound ? 'bg-jw-line text-jw-gray' : 'bg-jw-olive-deep text-white')}>{m.inbound ? who.charAt(0).toUpperCase() : 'J'}</span>
                      <div className={cx('flex min-w-0 flex-col gap-1', !m.inbound && 'items-end')}>
                        <span className="px-1 text-xs">
                          <b className="text-jw-ink">{who}</b> &middot; {m.time}
                          {i === d.messages.length - 1 && m.inbound && <span className="ml-1.5"><Badge tone="blue">Latest</Badge></span>}
                          {m.tag && <span className="ml-1.5"><Badge tone="line">{m.tag}</Badge></span>}
                        </span>
                        <p className={cx('m-0 whitespace-pre-line break-words rounded-card border px-4 py-2.5 leading-relaxed',
                          m.inbound ? 'border-jw-border bg-white text-jw-ink' : 'border-jw-olive-deep bg-jw-olive-deep text-white')}>{m.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card accent title={`Your reply to ${first}`}
            subtitle={queued ? 'Queued. It goes out within a few minutes.' : 'You can change any word before sending.'}
            right={queued ? <Badge tone="line">Queued</Badge> : !closed && (
              <>
                <span id="who-writes" className="sr-only">Who writes the reply</span>
                <Segmented options={MODES} value={mode} onChange={setMode} labelledBy="who-writes" />
              </>
            )}>
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-col gap-2.5 border-b border-jw-line pb-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <span>To <b className="text-jw-ink">{d.email}</b></span>
                  {!queued && !closed && activeTemplates.length > 0 && (
                    <label className="ml-auto flex items-center gap-2">
                      <span className={cx(label, 'text-jw-gray')}>Template</span>
                      <select className={cx(inputCls, 'min-h-[36px] w-auto max-w-[260px] py-1 text-[13px]')} value=""
                        onChange={(e) => applyTemplate(e.target.value)} aria-label="Use an email template">
                        <option value="">Choose a template…</option>
                        {TEMPLATE_CATEGORIES.map((c) => {
                          const inCat = activeTemplates.filter((t) => t.category === c.value);
                          return inCat.length ? (
                            <optgroup key={c.value} label={c.label}>
                              {inCat.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </optgroup>
                          ) : null;
                        })}
                      </select>
                    </label>
                  )}
                </div>
                <label className="flex items-center gap-2">
                  <span className={cx(label, 'w-[58px] flex-none text-jw-gray')}>Subject</span>
                  <input className={cx(inputCls, 'min-h-[38px] flex-1 py-1.5 text-[14px] font-semibold text-jw-ink')} value={subject}
                    disabled={!!queued || closed} onChange={(e) => setSubject(e.target.value)} aria-label="Email subject" />
                  {subject !== baseSubject && !queued && !closed && (
                    <button type="button" onClick={() => setSubject(baseSubject)} className="flex-none text-[12px] font-semibold text-jw-olive-deep">Reset</button>
                  )}
                </label>
                {tplNote && !queued && (
                  <span role="status" className="text-[12px] text-jw-olive-deep">Template “{tplNote}” added. Change anything before sending.</span>
                )}
                {unfilled.length > 0 && !queued && (
                  <span role="alert" className="border-l-4 border-jw-magenta bg-white px-3 py-1.5 text-[13px] text-jw-ink">
                    <b>Still to fill in:</b> {unfilled.map((v) => `{{${v}}}`).join(', ')}. We don't have these for {first} yet, so replace them with your own words.
                  </span>
                )}
              </div>

              {useAi && !d.draft && !queued ? (
                <div className="border border-dashed border-jw-border px-4 py-6 text-center">
                  {d.draftRequest && ['queued', 'processing'].includes(d.draftRequest.status) ? (
                    <>
                      <p role="status" className="m-0 font-semibold text-jw-ink">The AI is writing a reply…</p>
                      <p className="mb-3 mt-1 text-[13px]">It usually takes 1 to 2 minutes. It appears here by itself.</p>
                      <Button onClick={() => setMode(MODES[1])}>Write it myself instead</Button>
                    </>
                  ) : (
                    <>
                      <p className="m-0 font-semibold text-jw-ink">The AI has not written a reply for this enquiry.</p>
                      {d.draftRequest?.status === 'failed' ? (
                        <p role="alert" className="mb-3 mt-1 text-[13px] text-jw-ink"><b>The last try failed:</b> {d.draftRequest.last_error || 'Unknown error.'}</p>
                      ) : (
                        <p className="mb-3 mt-1 text-[13px]">Ask the AI to write one from the conversation and your knowledge files, or write it yourself.</p>
                      )}
                      {askError && <p role="alert" className="mb-3 mt-0 text-[13px] text-jw-ink"><b>That did not work.</b> {askError}</p>}
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button variant="primary" disabled={asking || closed} onClick={askAi}>{asking ? 'Asking…' : d.draftRequest?.status === 'failed' ? 'Try again' : 'Ask AI to write a reply'}</Button>
                        <Button onClick={() => setMode(MODES[1])}>Write it myself</Button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <label>
                  <span className="sr-only">Reply text</span>
                  <textarea className={cx(textareaCls, 'min-h-[240px] text-[15px]')} value={body} disabled={!!queued || closed}
                    placeholder={`Hi ${first},\n\nThank you for your enquiry...`} onChange={(e) => setBody(e.target.value)} onKeyDown={onKey} />
                </label>
              )}

              {canWrite && missing.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-l-4 border-jw-olive-deep bg-jw-pale px-3.5 py-2.5 text-jw-ink">
                  <span><b>{first} has not told us:</b> {list(missing)}.</span>
                  {asked
                    ? <span role="status" className="text-[13px] font-semibold text-jw-olive-deep">Question added to your reply.</span>
                    : <Button onClick={askMissing} className="min-h-[36px] px-3 text-[13px]">Add the question</Button>}
                </div>
              )}

              {useAi && d.draft?.sources?.length > 0 && !queued && (
                <span className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <Icon name="spark" size={12} className="text-jw-olive-deep" />The AI used:
                  {d.draft.sources.map((s) => <span key={s} className="border border-jw-border bg-jw-offwhite px-2 py-0.5 font-semibold text-jw-ink">{s}</span>)}
                </span>
              )}
              {actionError && <div role="alert" className="border-l-4 border-jw-ink bg-jw-offwhite px-3 py-2 text-jw-ink">{actionError}</div>}

              {queued ? (
                <SentNotice onUndo={queued.status === 'queued' ? undo : undefined}><b>Queued to send to {first}.</b> It goes out within a few minutes.</SentNotice>
              ) : !closed && (body.trim() || !useAi || d.draft) && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button variant="primary" onClick={send} disabled={busy || !body.trim()} className="min-w-[160px] disabled:opacity-60">{busy ? 'Sending…' : 'Send Reply'}</Button>
                  {useAi && d.draft && <Button href={gmailDraftUrl(d.draft.gmailDraftId)} target="_blank" rel="noreferrer">Open in Gmail</Button>}
                  <span className="text-[13px]">or press <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd></span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ---------- side: context ---------- */}
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <EditableSummary summary={d.summary} chasing={chasing} first={first} enquiryId={id} onSaved={reload} />
          <EditableCustomer contact={d.contact} contactId={d.contactId} onSaved={reload} />
          <EditableTravel travel={d.travel} enquiryId={id} onSaved={reload} />

          <Card title="Activity" subtitle={d.history.length ? 'Newest first' : undefined}>
            {d.history.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <ol className="m-0 max-h-[320px] list-none overflow-y-auto px-5 py-4">
                {d.history.map((h, i) => (
                  <li key={i} className="relative border-l border-jw-border pb-4 pl-5 last:border-l-transparent last:pb-0">
                    <span aria-hidden="true" className={cx('absolute -left-[5px] top-1 h-[9px] w-[9px] rounded-full', h.who === 'AI' ? 'bg-jw-olive-deep' : 'border-2 border-jw-olive-deep bg-white')} />
                    <span className="block text-jw-ink first-letter:uppercase">{h.text}</span>
                    <span className="block text-xs">{h.who} &middot; {h.time}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
