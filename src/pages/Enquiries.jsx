import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Card, cx, ErrorState, Empty } from '../components/ui';
import { Icon } from '../components/Icon.jsx';
import { listEnquiries, countByStatus, setEnquiryStatus, STATUS_FILTERS } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useLiveEnquiries } from '../lib/useLiveEnquiries';

// An inbox, not a spreadsheet: one row per customer with what they want in plain words,
// the status as a pill you can change, and one button for the next step.
// Reply / quote / follow-up / close all live on the enquiry itself (or Ctrl+K).

const STATUSES = STATUS_FILTERS.slice(1);

const PILL = {
  New: 'border-jw-olive-deep bg-jw-olive-deep text-white',
  Answered: 'border-jw-pale bg-jw-pale text-jw-olive-deep',
  'In progress': 'border-jw-ink bg-jw-ink text-white',
  'Follow-up': 'border-jw-magenta bg-white text-jw-magenta-dark',
  Resolved: 'border-jw-border bg-white text-jw-gray',
  Closed: 'border-jw-border bg-white text-jw-mid-gray',
};

/** "5m ago", "3h ago", "2d ago", then a short date. */
function ago(ts) {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Which heading a row sits under. Rows arrive newest first, so groups come out in order. */
function dayGroup(ts) {
  const d = new Date(ts), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'Last 7 days';
  return 'Older';
}

function Skeleton() {
  return (
    <div role="status" aria-label="Loading enquiries" className="motion-safe:animate-pulse">
      {[72, 56, 64, 48, 60, 52].map((w, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-jw-line px-5 py-4 last:border-b-0">
          <span className="h-10 w-10 flex-none bg-jw-line" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="h-3 w-40 max-w-full bg-jw-line" />
            <span className="h-3 bg-jw-line" style={{ width: `${w}%` }} />
          </span>
          <span className="hidden h-8 w-24 flex-none bg-jw-line sm:block" />
        </div>
      ))}
    </div>
  );
}

export default function Enquiries() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('All');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(null); // enquiry id being saved
  const [msg, setMsg] = useState(null); // { ok } | { err }
  useEffect(() => { const t = setTimeout(() => setSearch(q), 250); return () => clearTimeout(t); }, [q]);
  const { data: rows, error, loading, reload, setData } = useAsync(() => listEnquiries({ filter, search }), [filter, search]);
  const counts = useAsync(() => countByStatus(), []);

  // New mail and status changes show up on their own. Rows that just arrived are tinted for a few seconds.
  const [fresh, setFresh] = useState(() => new Set());
  const live = useLiveEnquiries((added) => {
    reload(); counts.reload();
    if (!added.length) return;
    setMsg({ ok: added.length === 1 ? 'A new enquiry just arrived.' : `${added.length} new enquiries just arrived.` });
    setFresh((s) => new Set([...s, ...added]));
    setTimeout(() => setFresh((s) => new Set([...s].filter((x) => !added.includes(x)))), 8000);
  });

  const changeStatus = async (r, label) => {
    if (label === r.status) return;
    // Closing needs a reason, so it goes to the close page.
    if (label === 'Closed') return navigate(`/enquiries/${r.id}/close`);
    setSaving(r.id); setMsg(null);
    setData((list) => list.map((x) => (x.id === r.id ? { ...x, status: label } : x)));
    try {
      await setEnquiryStatus(r.id, label);
      setMsg({ ok: `${r.name} is now "${label}".` });
      counts.reload();
      reload();
    } catch (e) {
      setMsg({ err: `Could not change ${r.name}: ${e.message}` });
      reload();
    }
    setSaving(null);
  };

  const groups = useMemo(() => {
    const out = [];
    for (const r of rows || []) {
      const title = dayGroup(r.createdAt);
      if (out[out.length - 1]?.title !== title) out.push({ title, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [rows]);

  const filtered = filter !== 'All' || search.trim();

  return (
    <>
      <PageHeader title="Enquiries" purpose="Every enquiry from the inbox, newest first. The line under each name is what the customer wants."
        actions={live && (
          <span role="status" className="inline-flex items-center gap-2 self-center text-[13px] font-semibold text-jw-olive-deep" title="New mail appears here on its own. No need to refresh.">
            <span aria-hidden="true" className="relative inline-flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-jw-olive motion-safe:animate-ping" />
              <span className="relative h-2 w-2 rounded-full bg-jw-olive-deep" />
            </span>
            Live
          </span>
        )} />

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-jw-border">
        <div role="group" aria-label="Filter by status" className="-mb-px flex min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STATUS_FILTERS.map((f) => {
            const on = filter === f, n = counts.data?.[f];
            return (
              <button key={f} type="button" aria-pressed={on} onClick={() => setFilter(f)}
                className={cx('inline-flex min-h-[44px] flex-none items-center gap-2 whitespace-nowrap border-b-2 px-3.5 font-medium',
                  on ? 'border-jw-olive-deep font-semibold text-jw-olive-deep' : 'border-transparent text-jw-gray hover:text-jw-ink')}>
                {f}
                {n !== undefined && (
                  <span className={cx('min-w-[22px] px-1.5 py-px text-center text-xs font-semibold tabular-nums', on ? 'bg-jw-olive-deep text-white' : 'bg-jw-line text-jw-gray')}>{n}</span>
                )}
              </button>
            );
          })}
        </div>
        <label className="relative mb-2 flex-[0_1_300px]">
          <span className="sr-only">Search enquiries</span>
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-jw-mid-gray" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, subject or summary"
            className="box-border h-10 w-full border border-jw-border bg-white pl-9 pr-3 font-body text-sm text-jw-ink placeholder:text-jw-mid-gray" />
        </label>
      </div>

      {msg && (
        <div role={msg.err ? 'alert' : 'status'} className={cx('border-l-4 px-3.5 py-2.5 text-jw-ink', msg.err ? 'border-jw-ink bg-jw-offwhite' : 'border-jw-olive-deep bg-jw-pale')}>
          {msg.err || msg.ok}
        </div>
      )}

      <Card aria-label="Enquiries">
        {error ? (
          <ErrorState error={error} onRetry={() => { reload(); counts.reload(); }} />
        ) : !rows ? (
          <Skeleton />
        ) : !rows.length ? (
          <Empty>{filtered ? 'No enquiries match this filter.' : 'No enquiries yet. New mail appears here automatically.'}</Empty>
        ) : (
          groups.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h2 className="m-0 flex items-center gap-2 border-b border-jw-line bg-jw-offwhite px-5 py-2 font-body text-[11px] font-semibold uppercase tracking-wider text-jw-gray">
                {g.title}<span className="font-normal tabular-nums text-jw-mid-gray">{g.rows.length}</span>
              </h2>
              <ul className="m-0 list-none p-0">
                {g.rows.map((r) => {
                  const isNew = r.status === 'New';
                  return (
                    <li key={r.id} className={cx('relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-jw-line px-5 py-3 hover:bg-jw-offwhite',
                      fresh.has(r.id) && 'shadow-[inset_3px_0_0_#E30079] motion-safe:animate-[enq-new_8s_ease-out]')}>
                      <span aria-hidden="true" className={cx('inline-flex h-10 w-10 flex-none items-center justify-center font-head text-base font-semibold',
                        isNew ? 'bg-jw-olive-deep text-white' : 'bg-jw-line text-jw-gray')}>{r.name.charAt(0).toUpperCase()}</span>

                      <div className="min-w-0 flex-[1_1_280px]">
                        <div className="flex items-baseline gap-2">
                          {isNew && <span className="h-2 w-2 flex-none self-center rounded-full bg-jw-magenta" title="New, not answered yet" />}
                          {/* The link covers the whole row; the pill and button sit above it. */}
                          <Link to={`/enquiries/${r.id}`} className={cx('truncate text-[15px] text-jw-ink after:absolute after:inset-0', isNew ? 'font-bold' : 'font-semibold')}>{r.name}</Link>
                          <span className="flex-none text-xs text-jw-mid-gray" title={r.received}>{ago(r.createdAt)}</span>
                        </div>
                        <div className={cx('truncate text-jw-ink', isNew && 'font-semibold')}>{r.subject}</div>
                        <div className="truncate text-[13px]">{r.summary || r.email}</div>
                      </div>

                      <label className={cx('relative z-10 flex-none border', PILL[r.status] || PILL.Resolved, saving === r.id && 'opacity-60')}>
                        <span className="sr-only">Status for {r.name}</span>
                        <select value={r.status} disabled={saving === r.id} onChange={(e) => changeStatus(r, e.target.value)}
                          className="h-8 cursor-pointer appearance-none border-0 bg-transparent pl-3 pr-7 font-body text-xs font-semibold text-inherit">
                          {STATUSES.map((s) => <option key={s} value={s} className="bg-white text-jw-ink">{s === 'Closed' && r.status !== 'Closed' ? 'Closed… (pick reason)' : s}</option>)}
                        </select>
                        <span aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]">&#9662;</span>
                      </label>

                      {r.next.act ? (
                        <Link to={r.next.to || `/enquiries/${r.id}`}
                          className="relative z-10 inline-flex h-8 w-[124px] flex-none items-center justify-center gap-1.5 border border-jw-olive-deep bg-white text-[13px] font-semibold text-jw-olive-deep hover:bg-jw-olive-deep hover:text-white">
                          {r.next.label} <span aria-hidden="true">&rarr;</span>
                        </Link>
                      ) : (
                        <span className="w-[124px] flex-none text-center text-[13px] text-jw-mid-gray">{r.next.label}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
        {rows && !error && rows.length > 0 && (
          <div className="px-5 py-3 text-[13px]">{loading ? 'Updating…' : `Showing ${rows.length} ${rows.length === 1 ? 'enquiry' : 'enquiries'}`}</div>
        )}
      </Card>
    </>
  );
}
