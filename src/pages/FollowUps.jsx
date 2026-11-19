import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, EnquiryHeader, NextBanner, Card, Badge, Button, Loading, ErrorState, Empty, inputCls, textareaCls, cx } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../lib/auth.jsx';
import {
  FOLLOWUP_FILTERS, FOLLOWUP_STEPS, STEP_TEMPLATE, listFollowUps, followUpInsights, getEnquiryHeader, getFollowUp,
  saveFollowUp, sendFollowUpNow, moveFollowUp, enhanceFollowUp, cancelFollowUp, setFollowUpsPaused,
  followUpTemplateData, fillTemplate,
} from '../lib/api';

/** Insights row: what is waiting, what went out, and whether it worked. */
function Insights({ q }) {
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="Loading follow-up numbers" />;
  const d = q.data;
  const cards = [
    { h: 'Due today', n: d.due, s: 'Today or overdue.' },
    { h: 'Waiting', n: d.scheduled, s: 'Going out later.' },
    { h: 'Sent', n: d.sent30, s: 'Last 30 days.' },
    { h: 'Failed', n: d.failed, s: 'Did not go out. Check and resend.' },
    { h: 'Customer replied', n: d.replied, s: d.replyRate === null ? 'No follow-ups sent yet.' : `${d.replyRate}% of sent follow-ups got a reply.` },
    { h: 'Avg wait', n: d.avgDays === null ? '–' : `${d.avgDays}d`, s: 'From scheduled to sent.' },
  ];
  return (
    <section aria-label="Follow-up insights" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.h} className="flex min-w-0 flex-col gap-1 rounded-card border border-jw-border bg-white px-5 py-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-jw-olive-deep">{c.h}</span>
          <span className="font-head text-[30px] font-semibold leading-tight tabular-nums text-jw-ink">{c.n}</span>
          <span className="text-[13px]">{c.s}</span>
        </div>
      ))}
    </section>
  );
}

const TONE = { 'Due today': 'blue', Waiting: 'line', Sending: 'pale', Failed: 'ink', Sent: 'pale', Cancelled: 'line' };
const TEMPLATE = '1.1fr 1.8fr 130px 90px 100px';
const EMPTY = {
  All: 'No follow-ups yet. One is made automatically after a reply or quote goes out.',
  'Due today': 'Nothing is due today.',
  Waiting: 'Nothing is waiting to go out.',
  Failed: 'No failed follow-ups.',
  Sent: 'No follow-ups have gone out yet.',
  Cancelled: 'No cancelled follow-ups.',
};

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (ts) => {
  const d = ts ? new Date(ts) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const Label = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-[.25px] text-jw-gray">{children}</label>
);

export default function FollowUps({ enquiryId: propEnquiryId, embedded } = {}) {
  const [params] = useSearchParams();
  const enquiryId = propEnquiryId || params.get('enquiry') || '';
  const { user } = useAuth() || {};
  const agentName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';

  const [filter, setFilter] = useState('All');
  const [selId, setSelId] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState(null); // null | 'move' | 'cancel'
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const who = useAsync(() => (enquiryId ? getEnquiryHeader(enquiryId) : Promise.resolve(null)), [enquiryId]);
  const list = useAsync(() => listFollowUps(filter, enquiryId || undefined), [filter, enquiryId]);
  const insights = useAsync(() => (embedded || enquiryId ? Promise.resolve(null) : followUpInsights()), [enquiryId, embedded]);

  const rows = list.data || [];
  const f = rows.find((r) => r.id === selId) || rows[0] || null;
  const first = f?.name.split(' ')[0];
  const tpl = useAsync(() => (f ? followUpTemplateData(f.enquiryId) : Promise.resolve(null)), [f?.enquiryId]);

  // Load the selected follow-up into the editor.
  useEffect(() => {
    setSubject(f?.subject || '');
    setBody(f?.body || '');
    setMode(null);
    setActionError('');
  }, [f?.id, f?.subject, f?.body]);

  // While the AI is enhancing, check every 10 seconds until the text comes back.
  useEffect(() => {
    if (!f?.aiRequested) return undefined;
    const t = setInterval(async () => {
      try {
        const now = await getFollowUp(f.id);
        if (!now.aiRequested) { clearInterval(t); await list.reload(); setNotice(now.lastError ? '' : 'The AI updated the text. Read it, then Save or Send now.'); }
      } catch { /* try again next tick */ }
    }, 10000);
    return () => clearInterval(t);
  }, [f?.id, f?.aiRequested]);

  const dirty = f && (subject !== f.subject || body !== f.body || (f.editable && f.oldFormat));
  const busy = saving || f?.aiRequested;
  const edits = { subject, body };

  const run = async (fn, okText) => {
    setSaving(true); setActionError(''); setNotice('');
    try {
      await fn();
      setNotice(okText);
      setMode(null);
      await Promise.all([list.reload(), insights.reload()]);
    } catch (e) {
      setActionError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const useTemplate = (id) => {
    const t = tpl.data?.templates.find((x) => x.id === id);
    if (!t) return;
    const vars = { ...tpl.data.vars, agent_name: agentName };
    setBody(fillTemplate(t.body, vars));
    if (t.subject?.trim()) setSubject(fillTemplate(t.subject, vars));
    setNotice(`Template "${t.name}" added. Change anything, then Save.`);
  };
  // Templates for this step first.
  const templates = (tpl.data?.templates || []).slice().sort((a, b) =>
    (b.category === STEP_TEMPLATE[f?.step]) - (a.category === STEP_TEMPLATE[f?.step]) || a.name.localeCompare(b.name));

  const hint = !f ? '' : f.aiRequested ? 'The AI is working on this text. It usually takes about 2 minutes.'
    : !f.editable ? (f.status === 'Sending' ? 'This is being sent now.' : f.status === 'Failed' ? 'n8n is still holding this one. It tries again within an hour.' : 'This follow-up is finished and cannot be changed.')
    : f.oldFormat && subject === f.subject && body === f.body ? 'This text is stored in the old format. Check it, then press Save.'
    : dirty ? 'Not saved yet.'
    : body ? `Saved. ${f.status === 'Failed' ? 'Press Send now to try again.' : `Goes out ${f.due.charAt(0).toLowerCase()}${f.due.slice(1)}.`}`
    : 'Leave empty and the AI writes it when it goes out.';

  const person = who.data;
  const banner = !f ? 'Pick a follow-up from the list.'
    : f.status === 'Failed' ? `The follow-up to ${first} did not go out. Read the error, fix the text if needed, then press Send now.`
    : f.editable ? `Read the follow-up to ${first}. Change anything, then press Save, or Send now.`
    : `Pick a follow-up from the list.`;

  return (
    <div className="flex flex-col gap-5">
      {embedded ? null : enquiryId ? (
        person ? (
          <>
            <EnquiryHeader e={person} step={3} />
            <Link to="/follow-ups" className="-mt-2 self-start text-[13px] font-semibold text-jw-olive-deep">See all follow-ups &rarr;</Link>
          </>
        ) : (
          <PageHeader title="Follow up" purpose={who.error ? 'Could not load this customer.' : 'Loading customer…'}
            back={{ to: '/enquiries', label: 'Back to enquiries' }} />
        )
      ) : (
        <PageHeader title="Follow-ups" purpose="Reminders to customers who went quiet: what is due, what went out, and whether customers replied." />
      )}
      {!embedded && !enquiryId && <Insights q={insights} />}
      <NextBanner label="What to do now" text={banner} />

      <Card aria-label="Follow-up list" title="Follow-ups"
        right={(
          <label className="flex items-center gap-2 text-[13px]">
            <span className="sr-only">Filter by status</span>
            <select value={filter} onChange={(e) => { setFilter(e.target.value); setSelId(null); setNotice(''); }}
              className="rounded-card border border-jw-border bg-white px-2.5 py-1.5 text-[13px] text-jw-ink">
              {FOLLOWUP_FILTERS.map((x) => <option key={x} value={x}>Status: {x}</option>)}
            </select>
          </label>
        )}>
        {list.loading && !list.data ? (
          <Loading what="Loading follow-ups" />
        ) : list.error ? (
          <div className="p-5"><ErrorState error={list.error} onRetry={list.reload} /></div>
        ) : rows.length === 0 ? (
          <Empty>{EMPTY[filter]}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div style={{ gridTemplateColumns: TEMPLATE }} className="grid gap-4 border-b border-jw-line bg-jw-offwhite px-5 py-2.5 text-xs font-semibold uppercase tracking-[.25px]">
                <span>Customer</span><span>Subject</span><span>Due</span><span>Sequence</span><span>Status</span>
              </div>
              {rows.map((r) => {
                const on = f?.id === r.id;
                return (
                  <div key={r.id} role="button" tabIndex={0} aria-pressed={on}
                    onClick={() => { setSelId(r.id); setNotice(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(r.id); setNotice(''); } }}
                    style={{ gridTemplateColumns: TEMPLATE }}
                    className={cx('grid min-h-[52px] w-full cursor-pointer items-center gap-4 border-b border-jw-line px-5 text-left text-jw-gray hover:bg-jw-offwhite',
                      on && 'bg-jw-pale shadow-[inset_3px_0_0_#737101]')}>
                    <span className="truncate font-semibold text-jw-ink">{r.name}</span>
                    <span className="truncate">{r.subject}</span>
                    <span>{r.due}</span>
                    <span className="tabular-nums">{r.step} of {FOLLOWUP_STEPS}</span>
                    <span><Badge tone={TONE[r.status]}>{r.status}</Badge></span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {f && (
        <Card accent aria-labelledby="fd"
          title={<span id="fd">Follow-up to {first} <span className="font-normal text-jw-gray">· {f.step} of {FOLLOWUP_STEPS}</span></span>}
          right={(
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[f.status]}>{f.status === 'Sent' ? `Sent ${f.due.toLowerCase()}` : `${f.status} · ${f.due.toLowerCase()}`}</Badge>
              {!embedded && <Button to={`/enquiries/${f.enquiryId}`}>Open Enquiry</Button>}
            </div>
          )}>
          <div className="flex flex-col gap-3 px-5 py-4">
            {notice && <div role="status" className="bg-jw-pale px-3.5 py-3 text-jw-ink"><b>{notice}</b></div>}
            {f.lastError && !f.aiRequested && (
              <div role="alert" className="border-l-4 border-jw-ink bg-white px-3.5 py-2.5 text-jw-ink"><b>Last try failed:</b> {f.lastError}</div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fu-subject">Subject</Label>
              <input id="fu-subject" className={inputCls} value={subject} readOnly={!f.editable || busy} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fu-body">Message</Label>
              <textarea id="fu-body" className={cx(textareaCls, 'min-h-[180px]', f.aiRequested && 'text-jw-mid-gray')} value={body}
                readOnly={!f.editable || busy} placeholder="Leave empty and the AI writes it when it goes out."
                onChange={(e) => setBody(e.target.value)} />
              <span className={cx('text-[13px]', dirty && 'font-semibold text-jw-ink')}>{hint}</span>
            </div>

            {actionError && <div role="alert" className="border-l-4 border-jw-ink bg-white px-3.5 py-2.5 text-jw-ink"><b>That did not work.</b> {actionError}</div>}

            {f.editable && mode === null && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-jw-line pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={busy} onClick={() => run(() => enhanceFollowUp(f, edits), body.trim() ? 'The AI is improving your text.' : 'The AI is writing the text.')}>
                    {f.aiRequested ? 'AI working…' : 'Enhance with AI'}
                  </Button>
                  <select aria-label="Use template" value="" disabled={busy || !templates.length} onChange={(e) => useTemplate(e.target.value)}
                    className="h-11 rounded-card border border-jw-border bg-white px-3 text-sm text-jw-ink">
                    <option value="">{templates.length ? 'Use template' : 'No follow-up templates'}</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <Button disabled={busy || !dirty} onClick={() => run(() => saveFollowUp(f, edits), 'Saved.')}>{saving ? 'Saving…' : 'Save'}</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={busy} onClick={() => { setNewDate(toLocalInput(f.dueAt)); setMode('move'); setNotice(''); }}>Move Date</Button>
                  <Button disabled={busy} onClick={() => { setMode('cancel'); setNotice(''); }}>Cancel Follow-up</Button>
                  <Button variant="primary" disabled={busy} onClick={() => run(() => sendFollowUpNow(f, edits), 'Queued. It goes out within about 2 minutes.')}>
                    {saving ? 'Queuing…' : 'Send Now'}
                  </Button>
                </div>
              </div>
            )}
            {f.editable && mode === 'move' && (
              <div className="flex flex-wrap items-end gap-2 border-t border-jw-line pt-3">
                <label className="flex flex-[1_1_220px] flex-col gap-1.5 text-xs font-semibold uppercase tracking-[.25px] text-jw-gray">
                  New date and time
                  <input type="datetime-local" className={inputCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </label>
                <Button variant="primary" disabled={saving || !newDate} onClick={() => run(() => moveFollowUp(f, newDate, edits), 'Date moved. Your text is saved too.')}>{saving ? 'Saving…' : 'Save Date'}</Button>
                <Button disabled={saving} onClick={() => setMode(null)}>Back</Button>
              </div>
            )}
            {f.editable && mode === 'cancel' && (
              <div className="flex flex-col gap-2 border-t border-jw-line bg-jw-offwhite px-3.5 py-3 text-jw-ink">
                <span>Cancel this follow-up to {f.name}? It will not go out.</span>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" disabled={saving} onClick={() => run(() => cancelFollowUp(f.id), 'Follow-up cancelled.')}>{saving ? 'Cancelling…' : 'Yes, Cancel It'}</Button>
                  <Button disabled={saving} onClick={() => setMode(null)}>Keep It</Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {f && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-jw-border bg-white px-5 py-3.5 text-[14px]">
          <span>
            <b className="text-jw-ink">{f.paused ? `Follow-ups for ${first} are paused.` : `Follow-ups for ${first} are on.`}</b>{' '}
            {f.paused ? 'Nothing goes out until you resume.' : `They stop if ${first} replies.`}
          </span>
          <Button disabled={saving} onClick={() => run(() => setFollowUpsPaused(f.enquiryId, !f.paused), f.paused ? `Follow-ups for ${first} resumed.` : `Follow-ups for ${first} paused.`)}>
            {f.paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      )}
    </div>
  );
}
