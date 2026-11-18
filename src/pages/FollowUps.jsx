import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, EnquiryHeader, NextBanner, Card, Badge, Button, Field, Loading, ErrorState, Empty, inputCls, textareaCls, cx } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { FOLLOWUP_TABS, listFollowUps, followUpCounts, sendFollowUpNow, moveFollowUp, cancelFollowUp, getEnquiryHeader, followUpInsights, scheduleFollowUp } from '../lib/api';

/** Insights row: what is waiting, what went out, and whether it worked. */
function Insights({ q }) {
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="Loading follow-up numbers" />;
  const d = q.data;
  const cards = [
    { h: 'Due now', n: d.due, s: 'Today or overdue.' },
    { h: 'Scheduled', n: d.scheduled, s: 'Going out later.' },
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

const inTwoDays = () => { const d = new Date(Date.now() + 2 * 86400000); d.setSeconds(0, 0); return d; };

const TEMPLATE = '1.1fr 2fr 130px 110px';

const Notice = ({ children }) => (
  <div role="status" className="bg-jw-pale px-3.5 py-3 text-jw-ink">{children}</div>
);

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (ts) => {
  const d = ts ? new Date(ts) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function FollowUps({ enquiryId: propEnquiryId, embedded } = {}) {
  const [tab, setTab] = useState(FOLLOWUP_TABS[0]);
  const [selId, setSelId] = useState(null);
  const [body, setBody] = useState('');
  const [mode, setMode] = useState(null); // null | 'move' | 'cancel'
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const [params] = useSearchParams();
  const enquiryId = propEnquiryId || params.get('enquiry') || '';
  const who = useAsync(() => (enquiryId ? getEnquiryHeader(enquiryId) : Promise.resolve(null)), [enquiryId]);
  const person = who.data;
  const first = person?.name.split(' ')[0];

  const list = useAsync(() => listFollowUps(tab, enquiryId || undefined), [tab, enquiryId]);
  const counts = useAsync(() => followUpCounts(enquiryId || undefined), [enquiryId]);
  const insights = useAsync(() => followUpInsights(enquiryId || undefined), [enquiryId]);

  // Schedule a new follow-up for this customer (no quote needed).
  const [schedAt, setSchedAt] = useState(() => toLocalInput(inTwoDays()));
  const [schedBody, setSchedBody] = useState('');

  // For one customer, open the first tab that has something in it.
  const [autoTab, setAutoTab] = useState(true);
  useEffect(() => { setAutoTab(true); setTab(FOLLOWUP_TABS[0]); }, [enquiryId]);
  useEffect(() => {
    if (!enquiryId || !autoTab || !counts.data) return;
    const t = FOLLOWUP_TABS.find((x) => counts.data[x] > 0);
    if (t && t !== tab) { setTab(t); setSelId(null); }
    setAutoTab(false);
  }, [counts.data, enquiryId, autoTab]);

  const rows = list.data || [];
  const f = rows.find((r) => r.id === selId) || rows[0] || null;
  const readOnly = tab === 'Sent';

  // When the selected row changes, load its draft and reset the action panel.
  useEffect(() => {
    setBody(f?.body || '');
    setMode(null);
    setActionError('');
  }, [f?.id, f?.body]);

  const changeTab = (t) => { setTab(t); setSelId(null); setNotice(''); setAutoTab(false); };

  const run = async (fn, okText) => {
    setSaving(true); setActionError(''); setNotice('');
    try {
      await fn();
      setNotice(okText);
      setMode(null);
      setSelId(null);
      await Promise.all([list.reload(), counts.reload(), insights.reload()]);
    } catch (e) {
      setActionError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const schedule = (e) => {
    e.preventDefault();
    run(async () => { await scheduleFollowUp(enquiryId, schedAt, schedBody); setSchedBody(''); setSchedAt(toLocalInput(inTwoDays())); },
      `Follow-up to ${first} scheduled.`);
  };

  const emptyText = person ? {
    'Due now': `No follow-up to ${first} is due today.`,
    Scheduled: `No follow-up to ${first} is scheduled.`,
    Sent: `No follow-up has gone to ${first} yet.`,
  }[tab] : {
    'Due now': 'Nothing is due. Follow-ups appear here on the day they should go out.',
    Scheduled: 'No follow-ups are scheduled. One is made automatically after a quote goes out.',
    Sent: 'No follow-ups have gone out yet.',
  }[tab];

  const total = counts.data ? FOLLOWUP_TABS.reduce((a, t) => a + counts.data[t], 0) : null;
  const bannerText = person
    ? total === 0 ? `${first} has no follow-ups yet.`
      : f && !readOnly ? `Read the reminder to ${first} on the right. Change anything, then press Send Follow-up.`
      : `Pick a follow-up to ${first} from the list.`
    : 'Pick a customer from the list. The AI wrote the reminder on the right: read it and press Send Follow-up.';

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
      <NextBanner label="What to do now" text={bannerText} />

      <div className="flex flex-wrap items-start gap-4">
        <Card aria-label="Follow-up list" className="flex-[3_1_480px]">
          <div role="tablist" aria-label="Follow-up lists" className="flex flex-wrap border-b border-jw-border px-2">
            {FOLLOWUP_TABS.map((t) => {
              const on = tab === t;
              return (
                <button key={t} type="button" role="tab" aria-selected={on} onClick={() => changeTab(t)}
                  className={cx('inline-flex min-h-[44px] items-center gap-2 border-b-2 px-4 font-medium',
                    on ? 'border-jw-olive-deep font-semibold text-jw-olive-deep' : 'border-transparent text-jw-gray')}>
                  {t}
                  <span className={cx('rounded-card px-[7px] py-px text-xs tabular-nums', on ? 'bg-jw-pale text-jw-olive-deep' : 'bg-jw-line text-jw-gray')}>
                    {counts.data ? counts.data[t] : '·'}
                  </span>
                </button>
              );
            })}
          </div>
          {list.loading && !list.data ? (
            <Loading what="Loading follow-ups" />
          ) : list.error ? (
            <div className="p-5"><ErrorState error={list.error} onRetry={list.reload} /></div>
          ) : rows.length === 0 ? (
            <Empty>{emptyText}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div style={{ gridTemplateColumns: TEMPLATE }} className="grid gap-4 border-b border-jw-line bg-jw-offwhite px-5 py-2.5 text-xs font-semibold uppercase tracking-[.25px]">
                  <span>Customer</span><span>Quote</span><span>{readOnly ? 'Sent' : 'Due'}</span><span>Next step</span>
                </div>
                {rows.map((r) => {
                  const on = f?.id === r.id;
                  return (
                    <div key={r.id} role="button" tabIndex={0} aria-pressed={on}
                      onClick={() => setSelId(r.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(r.id); } }}
                      style={{ gridTemplateColumns: TEMPLATE }}
                      className={cx('grid min-h-[56px] w-full cursor-pointer items-center gap-4 border-b border-jw-line px-5 text-left text-jw-gray hover:bg-jw-offwhite',
                        on && 'bg-jw-pale shadow-[inset_3px_0_0_#737101]')}>
                      <Link to={`/enquiries/${r.enquiryId}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-jw-ink hover:text-jw-olive-deep">{r.name}</Link>
                      <span className="truncate">{r.quote}</span>
                      <span>{r.due}</span>
                      <span className="whitespace-nowrap font-semibold text-jw-olive-deep">{readOnly ? 'Sent' : r.lastError ? 'Failed' : 'Open →'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="px-5 py-3 text-[13px]">A follow-up is made 2 days after a quote goes out. If the customer replies first, it is cancelled for you.</div>
        </Card>

        <Card accent aria-labelledby="fd" className="flex-[2_1_380px]"
          right={f && <Badge tone={readOnly ? 'line' : 'pale'}>{readOnly ? 'Sent' : 'Ready to send'}</Badge>}
          title={<span id="fd">{f ? `Follow-up to ${f.name.split(' ')[0]}` : 'Follow-up'}</span>}
          subtitle={f ? `To ${f.name}, ${readOnly ? 'sent' : 'due'} ${f.due.charAt(0).toLowerCase()}${f.due.slice(1)}` : 'Pick a follow-up from the list.'}>
          <div className="flex flex-col gap-3 px-5 py-4">
            {notice && <Notice><b>{notice}</b></Notice>}
            {!f ? (
              !notice && <span className="text-[13px]">Nothing selected.</span>
            ) : (
              <>
                <div className="text-[13px]">Subject: <b className="text-jw-ink">{f.subject}</b></div>
                {f.lastError && (
                  <div role="alert" className="border-l-4 border-jw-ink bg-white px-3.5 py-2.5 text-jw-ink">
                    <b>Last try failed:</b> {f.lastError}
                  </div>
                )}
                <textarea aria-label="Follow-up text" className={cx(textareaCls, 'min-h-[170px]')} value={body} readOnly={readOnly}
                  placeholder="Leave empty and the AI writes it when it goes out."
                  onChange={(e) => setBody(e.target.value)} />
                {actionError && <div role="alert" className="border-l-4 border-jw-ink bg-white px-3.5 py-2.5 text-jw-ink"><b>That did not work.</b> {actionError}</div>}
                {!readOnly && mode === null && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" className="min-w-[170px]" disabled={saving}
                      onClick={() => run(() => sendFollowUpNow(f.id, body), 'Queued. It goes out within a few minutes.')}>
                      {saving ? 'Queuing…' : 'Send Follow-up'}
                    </Button>
                    <Button disabled={saving} onClick={() => { setNewDate(toLocalInput(f.dueAt)); setMode('move'); setNotice(''); }}>Move Date</Button>
                    <Button disabled={saving} onClick={() => { setMode('cancel'); setNotice(''); }}>Cancel It</Button>
                  </div>
                )}
                {!readOnly && mode === 'move' && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-xs font-semibold uppercase tracking-[.25px] text-jw-gray">
                      New date and time
                      <input type="datetime-local" className={inputCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                    </label>
                    <Button variant="primary" disabled={saving || !newDate}
                      onClick={() => run(() => moveFollowUp(f.id, newDate), 'Date moved.')}>{saving ? 'Saving…' : 'Save'}</Button>
                    <Button disabled={saving} onClick={() => setMode(null)}>Back</Button>
                  </div>
                )}
                {!readOnly && mode === 'cancel' && (
                  <div className="flex flex-col gap-2 bg-jw-offwhite px-3.5 py-3 text-jw-ink">
                    <span>Cancel this follow-up to {f.name}? It will not go out.</span>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" disabled={saving}
                        onClick={() => run(() => cancelFollowUp(f.id), 'Follow-up cancelled.')}>{saving ? 'Cancelling…' : 'Yes, Cancel It'}</Button>
                      <Button disabled={saving} onClick={() => setMode(null)}>Keep It</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
