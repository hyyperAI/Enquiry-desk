import { useEffect, useState } from 'react';
import { PageHeader, Chip, Badge, Button, Kbd, Loading, ErrorState, Empty, inputCls, cx } from '../components/ui.jsx';
import { listConversations, subscribeChats, listMessages, markRead, setLabels, sendChatMessage, CHAT_LABELS, CHAT_APPS, when } from '../lib/api.js';
import chatConnectionImg from '../assets/chat connection.png';
import { useAsync } from '../lib/useAsync.js';
import { useAuth } from '../lib/auth.jsx';

const nameOf = (c) => c?.customer_name || c?.contact_handle || 'Unknown';
const factLabel = (k) => String(k).replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());
const factValue = (v) => (v == null || v === '' ? 'Not given' : typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : JSON.stringify(v)) : String(v));

export default function Chats() {
  const { user } = useAuth();
  const { data: list, error, loading, reload, setData } = useAsync(() => listConversations(), []);
  const [selId, setSelId] = useState(null);
  const [filter, setFilter] = useState(null);
  const [draft, setDraft] = useState('');
  const [picker, setPicker] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [msgState, setMsgState] = useState({ loading: false, error: null });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [labelError, setLabelError] = useState(null);

  // Live updates: reload the list (and open chat) when anything changes.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeChats(() => { reload(); setTick((t) => t + 1); }), [reload]);

  const rows = list || [];
  const cur = rows.find((c) => c.id === selId) || null;

  // Select the first chat once loaded.
  useEffect(() => { if (!selId && rows.length) setSelId(rows[0].id); }, [rows, selId]);

  // Load messages for the selected chat and mark it read.
  useEffect(() => {
    if (!selId) return;
    let live = true;
    setMsgState((s) => ({ loading: tick === 0 || s.loading, error: null }));
    listMessages(selId)
      .then((m) => { if (live) { setMsgs((old) => [...m, ...old.filter((x) => x.failed && x.conversation_id === selId)]); setMsgState({ loading: false, error: null }); } })
      .catch((e) => { if (live) setMsgState({ loading: false, error: e }); });
    return () => { live = false; };
  }, [selId, tick]);

  useEffect(() => {
    if (!cur || !cur.unread_count) return;
    setData((cs) => cs.map((c) => (c.id === cur.id ? { ...c, unread_count: 0 } : c)));
    markRead(cur.id).catch(() => {});
  }, [cur?.id, cur?.unread_count]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !list) return <Shell><Loading what="Loading chats" /></Shell>;
  if (error && !list) return <Shell><ErrorState error={error} onRetry={reload} /></Shell>;
  if (!rows.length) return <Shell><div className="flex flex-1 items-center justify-center py-12"><img src={chatConnectionImg} alt="Connect your chat apps" className="max-w-[400px] w-full" /></div></Shell>;

  const visible = rows.filter((c) => filter === null || c.channel === filter);

  const pick = (id) => {
    if (id === selId) return;
    setSelId(id); setMsgs([]); setDraft(''); setPicker(false); setSendError(null); setLabelError(null);
    setMsgState({ loading: true, error: null });
  };

  if (!cur) return <Shell><Loading what="Loading chats" /></Shell>;

  const first = nameOf(cur).split(' ')[0];
  const initials = nameOf(cur).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const labels = cur.labels || [];
  const facts = Object.entries(cur.facts || {});

  const toggleLabel = async (name) => {
    const next = labels.includes(name) ? labels.filter((l) => l !== name) : [...labels, name];
    const prev = labels;
    setLabelError(null);
    setData((cs) => cs.map((c) => (c.id === cur.id ? { ...c, labels: next } : c)));
    try { await setLabels(cur.id, next); }
    catch (e) { setData((cs) => cs.map((c) => (c.id === cur.id ? { ...c, labels: prev } : c))); setLabelError(e.message || String(e)); }
  };

  const send = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    const tempId = 'tmp-' + Date.now();
    setSending(true); setSendError(null); setDraft('');
    setMsgs((m) => [...m, { id: tempId, direction: 'outbound', body: t, status: 'queued', created_at: new Date().toISOString(), conversation_id: cur.id }]);
    try {
      const saved = await sendChatMessage(cur, t, user?.id);
      setMsgs((m) => m.map((x) => (x.id === tempId ? saved : x)));
      setData((cs) => cs.map((c) => (c.id === cur.id ? { ...c, ai_suggestion: null, last: { body: t, direction: 'outbound' }, time: 'Now' } : c)));
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === tempId ? { ...x, status: 'failed', failed: true } : x)));
      setSendError(e.message || String(e));
      setDraft(t);
    } finally { setSending(false); }
  };

  const statusText = (m) => (m.status === 'failed' ? 'Not sent' : m.status === 'queued' || m.status === 'processing' ? 'Queued' : m.status === 'sent' ? 'Sent' : '');

  const more = CHAT_LABELS.filter((l) => !labels.includes(l));
  const lbCls = 'inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-card border px-2.5 text-[13px]';

  return (
    <Shell>

      <div role="group" aria-label="Filter by app" className="flex flex-wrap gap-2">
        {CHAT_APPS.map((a) => (
          <Chip key={a.name} on={filter === a.value} onClick={() => setFilter(a.value)}
            count={a.value === null ? rows.length : rows.filter((c) => c.channel === a.value).length}>
            {a.name}
          </Chip>
        ))}
      </div>

      <section aria-label="Chats" className="flex flex-wrap overflow-hidden rounded-card border border-jw-border bg-white">
        <div aria-label="Chat list" className="flex min-w-0 flex-[1_1_300px] flex-col border-r border-jw-border">
          {visible.map((c) => {
            const on = c.id === selId;
            const last = c.last;
            return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => pick(c.id)}
                className={cx('flex w-full cursor-pointer flex-col gap-1 border-b border-jw-line px-4 py-3.5 text-left text-jw-gray',
                  on ? 'bg-jw-pale shadow-[inset_3px_0_0_#737101]' : 'bg-white')}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-jw-ink">{nameOf(c)}</span>
                  <span className="whitespace-nowrap text-xs">{c.time}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px]">{last ? (last.direction === 'outbound' ? 'You: ' : '') + (last.body || '') : 'No messages yet'}</span>
                  {c.unread_count > 0 && (
                    <span className="inline-flex h-5 min-w-[20px] flex-none items-center justify-center bg-jw-olive-deep px-1.5 text-xs font-semibold text-white">{c.unread_count}</span>
                  )}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-1.5">
                  <Badge tone="ink">{c.app}</Badge>
                  <Badge tone="line">{(c.labels || [])[0] || 'No label'}</Badge>
                </span>
              </button>
            );
          })}
          {visible.length === 0 && <div className="p-5">No chats from this app yet.</div>}
        </div>

        <div className="flex min-w-0 flex-[3_1_520px] flex-col">
          <div className="flex flex-col gap-3 border-b border-jw-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="inline-flex h-11 w-11 flex-none items-center justify-center bg-jw-olive-deep font-head font-semibold text-white">{initials}</span>
                <div className="min-w-0">
                  <h2 className="m-0 font-head text-lg font-semibold tracking-tight text-jw-ink">{nameOf(cur)}</h2>
                  <span className="text-[13px]">Chatting on <b className="text-jw-ink">{cur.app}</b> &nbsp;&middot;&nbsp; {cur.contact_handle}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {cur.enquiry_id && <Button to={`/enquiries/${cur.enquiry_id}`}>Open Enquiry</Button>}
                {cur.enquiry_id && <Button to={`/enquiries/${cur.enquiry_id}/quote`}>Make Quote</Button>}
              </div>
            </div>

            <div className="flex flex-wrap border border-jw-line">
              {facts.length === 0 && <div className="px-4 py-3 text-jw-mid-gray">No trip details yet</div>}
              {facts.map(([k, raw]) => {
                const v = factValue(raw);
                return (
                  <div key={k} className="flex flex-[1_1_130px] flex-col gap-0.5 border-r border-jw-line px-4 py-3 last:border-r-0">
                    <span className="text-xs font-semibold uppercase tracking-[.25px]">{factLabel(k)}</span>
                    <b className={v === 'Not given' ? 'font-medium text-jw-mid-gray' : 'font-semibold text-jw-ink'}>{v}</b>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[.25px]">Labels</span>
              {labels.map((l) => (
                <button key={l} type="button" onClick={() => toggleLabel(l)} aria-label={'Remove label ' + l}
                  className={cx(lbCls, 'border-jw-pale bg-jw-pale font-semibold text-jw-olive-deep')}>
                  {l} <span aria-hidden="true">&times;</span>
                </button>
              ))}
              <button type="button" onClick={() => setPicker((p) => !p)} aria-expanded={picker}
                className={cx(lbCls, 'border-jw-border bg-white font-medium text-jw-gray')}>+ Add label</button>
            </div>

            {labelError && <span role="alert" className="text-[13px] text-jw-ink"><b>Could not save labels.</b> {labelError}</span>}

            {picker && (
              <div className="flex flex-wrap items-center gap-2 bg-jw-offwhite px-3 py-2.5">
                <span className="text-[13px]">Click to add:</span>
                {more.map((l) => (
                  <button key={l} type="button" onClick={() => toggleLabel(l)}
                    className={cx(lbCls, 'border-jw-border bg-white font-medium text-jw-gray')}>{l}</button>
                ))}
              </div>
            )}
          </div>

          <div aria-label="Messages" className="flex min-h-[300px] flex-1 flex-col justify-end gap-2.5 bg-jw-offwhite p-5">
            {msgState.loading && <Loading what="Loading messages" />}
            {msgState.error && <ErrorState error={msgState.error} onRetry={() => setTick((x) => x + 1)} />}
            {!msgState.loading && !msgState.error && msgs.length === 0 && <Empty>No messages in this chat yet.</Empty>}
            {msgs.map((raw) => { const m = { ...raw, out: raw.direction === 'outbound', text: raw.body || '' }; return (
              <div key={m.id} className={cx('flex', m.out ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[72%] rounded-card px-3.5 py-2.5 leading-normal',
                  m.out ? 'bg-jw-olive-deep text-white' : 'border border-jw-border bg-white text-jw-ink')}>
                  <span className="block whitespace-pre-line">{m.text}</span>
                  <span className={cx('mt-1 block text-xs', m.out ? 'text-white opacity-80' : 'text-jw-gray')}>
                    {m.out ? 'You' : first} &nbsp;{when(m.created_at)}{m.out && statusText(m) ? ` \u00b7 ${statusText(m)}` : ''}
                  </span>
                </div>
              </div>
            ); })}
          </div>

          {cur.ai_suggestion && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-t border-jw-border bg-jw-pale px-5 py-3 text-jw-ink">
              <span className="min-w-0 flex-[1_1_320px]">
                <span className="block text-xs font-semibold uppercase tracking-wide text-jw-olive-deep">AI suggested reply</span>
                {cur.ai_suggestion}
              </span>
              <Button onClick={() => setDraft(cur.ai_suggestion)}>Use This Reply</Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-jw-border px-5 py-3.5">
            <label className="min-w-0 flex-[1_1_280px]">
              <span className="sr-only">Your message</span>
              <input className={inputCls} type="text" value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                placeholder={'Write to ' + first + ' on ' + cur.app} />
            </label>
            <Button variant="primary" onClick={send} disabled={sending || !draft.trim()} className="min-w-[110px]">{sending ? 'Sending…' : 'Send'}</Button>
            {sendError && (
              <span role="alert" className="flex-[1_1_100%] border-l-4 border-jw-ink bg-white px-3 py-2 text-[13px] text-jw-ink">
                <b>Could not queue your message.</b> {sendError}
              </span>
            )}
            <span className="flex-[1_1_100%] text-[13px]">
              Press <Kbd>Enter</Kbd> to send. It is queued and goes out on {cur.app} within a minute.
            </span>
          </div>
        </div>
      </section>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Chats"
        purpose="Every customer message from WhatsApp, Facebook, Instagram and email in one place. Pick a chat, read it, reply."
      />
      {children}
    </div>
  );
}
