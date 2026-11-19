import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Card, cx, ErrorState, Empty } from '../components/ui';
import { Icon } from '../components/Icon.jsx';
import { listEnquiryTable, setEnquiryStatus, STATUS_FILTERS, ENQUIRY_SOURCES } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useLiveEnquiries } from '../lib/useLiveEnquiries';

// One table, one line of filters. Click a row to open the enquiry; hover or click the summary to read all of it.

const STATUSES = STATUS_FILTERS.slice(1);
const DATES = { 'Any time': null, Today: 0, 'Last 7 days': 7, 'Last 30 days': 30 };
const YES_NO = ['All', 'Yes', 'No'];
const COLS = 'minmax(150px,1.2fr) 120px 120px 110px 100px 95px minmax(220px,2fr)';

const PILL = {
  New: 'border-jw-olive-deep bg-jw-olive-deep text-white',
  Answered: 'border-jw-pale bg-jw-pale text-jw-olive-deep',
  'In progress': 'border-jw-ink bg-jw-ink text-white',
  'Follow-up': 'border-jw-magenta bg-white text-jw-magenta-dark',
  Resolved: 'border-jw-border bg-white text-jw-gray',
  Closed: 'border-jw-border bg-white text-jw-mid-gray',
};

const contacted = (ts) => new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

function inRange(ts, days) {
  if (days === null) return true;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  return new Date(ts) >= start;
}

/** Compact "Label: value" dropdown. The native select sits on top, invisible, so it stays keyboard and screen-reader friendly. */
function Filter({ label, value, options, onChange }) {
  return (
    <label className="relative inline-flex h-9 flex-none items-center gap-1 whitespace-nowrap border border-jw-border bg-white pl-3 pr-8 text-[13px] text-jw-gray hover:border-jw-olive-deep">
      {label}: <span className="font-semibold text-jw-olive-deep">{value}</span>
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px]">&#9662;</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Loading enquiries" className="motion-safe:animate-pulse">
      {[72, 56, 64, 48, 60].map((w, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-jw-line px-5 py-4 last:border-b-0">
          <span className="h-3 w-32 bg-jw-line" />
          <span className="h-3 bg-jw-line" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function Enquiries() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('Any time');
  const [status, setStatus] = useState('All');
  const [source, setSource] = useState('All');
  const [needsReply, setNeedsReply] = useState('All');
  const [quote, setQuote] = useState('All');
  const [openSummary, setOpenSummary] = useState(null); // enquiry id pinned open by click
  const [saving, setSaving] = useState(null);
  const [msg, setMsg] = useState(null); // { ok } | { err }
  useEffect(() => { const t = setTimeout(() => setSearch(q), 250); return () => clearTimeout(t); }, [q]);
  const { data: all, error, loading, reload, setData } = useAsync(() => listEnquiryTable(), []);

  // New mail and status changes show up on their own. Rows that just arrived are tinted for a few seconds.
  const [fresh, setFresh] = useState(() => new Set());
  const live = useLiveEnquiries((added) => {
    reload();
    if (!added.length) return;
    setMsg({ ok: added.length === 1 ? 'A new enquiry just arrived.' : `${added.length} new enquiries just arrived.` });
    setFresh((s) => new Set([...s, ...added]));
    setTimeout(() => setFresh((s) => new Set([...s].filter((x) => !added.includes(x)))), 8000);
  });

  // Close a pinned summary when clicking anywhere else.
  useEffect(() => {
    if (!openSummary) return undefined;
    const close = () => setOpenSummary(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openSummary]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (all || []).filter((r) => (status === 'All' || r.status === status)
      && (source === 'All' || r.source === source)
      && (needsReply === 'All' || r.needsReply === (needsReply === 'Yes'))
      && (quote === 'All' || r.quoteSent === (quote === 'Yes'))
      && inRange(r.createdAt, DATES[date])
      && (!s || [r.name, r.email, r.summary].some((x) => x && x.toLowerCase().includes(s))));
  }, [all, search, status, source, needsReply, quote, date]);

  const changeStatus = async (r, label) => {
    if (label === r.status) return;
    // Closing needs a reason, so it goes to the close page.
    if (label === 'Closed') return navigate(`/enquiries/${r.id}/close`);
    setSaving(r.id); setMsg(null);
    setData((list) => list.map((x) => (x.id === r.id ? { ...x, status: label } : x)));
    try {
      await setEnquiryStatus(r.id, label);
      setMsg({ ok: `${r.name} is now "${label}".` });
      reload();
    } catch (e) {
      setMsg({ err: `Could not change ${r.name}: ${e.message}` });
      reload();
    }
    setSaving(null);
  };

  const filtered = search.trim() || [status, source, needsReply, quote].some((x) => x !== 'All') || date !== 'Any time';
  const clear = () => { setQ(''); setSearch(''); setDate('Any time'); setStatus('All'); setSource('All'); setNeedsReply('All'); setQuote('All'); };

  return (
    <>
      <PageHeader title="Enquiries" purpose="Every enquiry, newest first. Filter the list, then click a row to open it."
        actions={live && (
          <span role="status" className="inline-flex items-center gap-2 self-center text-[13px] font-semibold text-jw-olive-deep" title="New mail appears here on its own. No need to refresh.">
            <span aria-hidden="true" className="relative inline-flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-jw-olive motion-safe:animate-ping" />
              <span className="relative h-2 w-2 rounded-full bg-jw-olive-deep" />
            </span>
            Live
          </span>
        )} />

      {msg && (
        <div role={msg.err ? 'alert' : 'status'} className={cx('border-l-4 px-3.5 py-2.5 text-jw-ink', msg.err ? 'border-jw-ink bg-jw-offwhite' : 'border-jw-olive-deep bg-jw-pale')}>
          {msg.err || msg.ok}
        </div>
      )}

      <Card aria-label="Enquiries">
        <div role="group" aria-label="Filters" className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-jw-line px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <label className="relative h-9 flex-[0_0_210px]">
            <span className="sr-only">Search enquiries</span>
            <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-jw-mid-gray" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email"
              className="box-border h-9 w-full border border-jw-border bg-white pl-8 pr-2 font-body text-[13px] text-jw-ink placeholder:text-jw-mid-gray" />
          </label>
          <Filter label="Date" value={date} options={Object.keys(DATES)} onChange={setDate} />
          <Filter label="Status" value={status} options={STATUS_FILTERS} onChange={setStatus} />
          <Filter label="Source" value={source} options={['All', ...ENQUIRY_SOURCES]} onChange={setSource} />
          <Filter label="Needs reply" value={needsReply} options={YES_NO} onChange={setNeedsReply} />
          <Filter label="Quote sent" value={quote} options={YES_NO} onChange={setQuote} />
          {filtered && <button type="button" onClick={clear} className="h-9 flex-none px-2 text-[13px] font-semibold text-jw-olive-deep">Clear</button>}
        </div>

        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !all ? (
          <Skeleton />
        ) : !rows.length ? (
          <Empty>{filtered ? 'No enquiries match these filters.' : 'No enquiries yet. New mail appears here automatically.'}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1000px]">
              <div style={{ gridTemplateColumns: COLS }} className="grid gap-4 border-b border-jw-line bg-jw-offwhite px-5 py-2.5 text-xs font-semibold uppercase tracking-[.25px]">
                <span>Name</span><span>Contacted</span><span>Status</span><span>Source</span><span>Needs reply</span><span>Quote sent</span><span>Summary</span>
              </div>
              <ul className="m-0 list-none p-0">
                {rows.map((r, i) => {
                  const up = i >= rows.length - 3 && rows.length > 3; // open the popup upwards near the bottom so it is not cut off
                  const isNew = r.status === 'New';
                  const pinned = openSummary === r.id;
                  return (
                    <li key={r.id} style={{ gridTemplateColumns: COLS }}
                      className={cx('group relative grid min-h-[52px] items-center gap-4 border-b border-jw-line px-5 py-2 text-[14px] text-jw-gray hover:bg-jw-offwhite',
                        fresh.has(r.id) && 'shadow-[inset_3px_0_0_#E30079] motion-safe:animate-[enq-new_8s_ease-out]')}>
                      <span className="flex min-w-0 items-center gap-2" title={r.email}>
                        {isNew && <span className="h-2 w-2 flex-none rounded-full bg-jw-magenta" title="New, not answered yet" />}
                        {/* The link covers the whole row; the status, summary and its popup sit above it. */}
                        <Link to={`/enquiries/${r.id}`}
                          className={cx('truncate text-jw-ink after:absolute after:inset-0', isNew ? 'font-bold' : 'font-semibold')}>{r.name}</Link>
                      </span>
                      <span className="tabular-nums" title={r.received}>{contacted(r.createdAt)}</span>

                      {/* Sized by the visible label, not the longest option; the real select sits on top, invisible. */}
                      <label className={cx('relative z-10 inline-flex h-7 w-fit items-center gap-1.5 justify-self-start whitespace-nowrap border pl-2.5 pr-2 text-xs font-semibold focus-within:ring-2 focus-within:ring-jw-olive-deep/40',
                        PILL[r.status] || PILL.Resolved, saving === r.id && 'opacity-60')}>
                        {r.status}
                        <span aria-hidden="true" className="text-[9px]">&#9662;</span>
                        <select aria-label={`Status for ${r.name}`} value={r.status} disabled={saving === r.id} onChange={(e) => changeStatus(r, e.target.value)}
                          className="absolute inset-0 cursor-pointer opacity-0">
                          {STATUSES.map((s) => <option key={s} value={s}>{s === 'Closed' && r.status !== 'Closed' ? 'Closed… (pick reason)' : s}</option>)}
                        </select>
                      </label>

                      <span>{r.source}</span>
                      <span className={cx(r.needsReply && 'font-semibold text-jw-magenta-dark')}>{r.needsReply ? 'Yes' : 'No'}</span>
                      <span className={cx(r.quoteSent && 'font-semibold text-jw-olive-deep')}>{r.quoteSent ? 'Yes' : 'No'}</span>

                      <span className={cx('relative min-w-0 hover:z-30 focus-within:z-30', pinned ? 'z-30' : 'z-10')}>
                        <button type="button" aria-expanded={pinned} disabled={!r.summary}
                          onClick={(e) => { e.stopPropagation(); setOpenSummary(pinned ? null : r.id); }}
                          className="peer block w-full cursor-pointer truncate text-left text-[13px] text-jw-gray disabled:cursor-default">
                          {r.summary || 'No summary yet.'}
                        </button>
                        {r.summary && (
                          <span role="tooltip" onClick={(e) => e.stopPropagation()}
                            className={cx('absolute right-0 z-20 w-[340px] max-w-[80vw] select-text border border-jw-border bg-white p-3 text-[13px] leading-relaxed text-jw-ink shadow-[0_8px_24px_rgba(0,0,0,.12)]',
                              up ? 'bottom-full mb-1' : 'top-full mt-1', pinned ? 'block' : 'hidden peer-hover:block peer-focus-visible:block')}>
                            {r.summary}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
        {all && !error && (
          <div className="px-5 py-3 text-[13px]">
            {loading ? 'Updating…' : filtered ? `Showing ${rows.length} of ${all.length} enquiries` : `Showing ${all.length} ${all.length === 1 ? 'enquiry' : 'enquiries'}`}
          </div>
        )}
      </Card>
    </>
  );
}
