import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, NextBanner, Card, Badge, statusTone, Button, Table, cx, Loading, ErrorState, Empty } from '../components/ui';
import { getHome } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useLiveEnquiries } from '../lib/useLiveEnquiries';

const BRAND = '#737101';
const RANGES = [{ key: 'day', label: 'Days', sub: 'Last 14 days' }, { key: 'week', label: 'Weeks', sub: 'Last 12 weeks' }, { key: 'month', label: 'Months', sub: 'Last 12 months' }];

/** Smooth curve through points (Catmull-Rom as cubic Béziers). Control points are clamped to the chart so the curve never dips below 0. */
function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]} ${pts[0][1]}` : '';
  const c = (v) => Math.min(100, Math.max(0, v));
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, c(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, c(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/** Enquiries in (dark layer) and replies out (light layer), smooth areas with soft gradients. */
function Chart({ chart, periods, range, setRange }) {
  const [hover, setHover] = useState(null);
  const enq = chart.map((d) => d.enquiries), rep = chart.map((d) => d.replies), labels = chart.map((d) => d.day);
  const n = enq.length;
  const top = Math.max(4, Math.ceil((Math.max(...enq, ...rep) * 1.15) / 4) * 4);
  const xs = enq.map((_, i) => (n === 1 ? 50 : (i / (n - 1)) * 100));
  const ye = enq.map((v) => 100 - (v / top) * 100);
  const yr = rep.map((v) => 100 - (v / top) * 100);
  const line = (ys) => smooth(xs.map((x, i) => [x, ys[i]]));
  const area = (ys) => `${line(ys)} L100 100 L0 100 Z`;
  const yLabels = [0, 1, 2, 3, 4].map((k) => Math.round((top / 4) * k));
  const step = n > 12 ? 2 : 1;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const cur = RANGES.find((r) => r.key === range);
  const tg = (on) => cx('inline-flex min-h-[40px] min-w-[64px] items-center justify-center border px-3 font-medium',
    on ? 'border-jw-olive-deep bg-jw-olive-deep text-white' : 'border-jw-border bg-white text-jw-gray');

  return (
    <Card aria-labelledby="h-chart" title={<span id="h-chart">Enquiries Over Time</span>} subtitle={`${cur.sub}. Hover a point.`}
      right={
        <div role="group" aria-label="Group by" className="flex">
          {RANGES.map((r) => <button key={r.key} type="button" className={tg(range === r.key)} aria-pressed={range === r.key} onClick={() => { setRange(r.key); setHover(null); }}>{r.label}</button>)}
        </div>
      }>
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-jw-line px-5 py-3">
        {periods.map((p) => (
          <span key={p.label} className="flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide">{p.label}</span>
            <span className="font-head text-[22px] font-semibold tabular-nums text-jw-ink">{p.n}</span>
          </span>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-5 text-[13px]">
          <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 bg-jw-olive-deep" />Enquiries in <b className="tabular-nums text-jw-ink">{sum(enq)}</b></span>
          <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 bg-jw-olive-deep opacity-30" />Replies out <b className="tabular-nums text-jw-ink">{sum(rep)}</b></span>
        </span>
      </div>
      <div className="flex gap-2 px-5 pb-5 pt-4">
        <div className="flex h-[240px] w-6 flex-col-reverse justify-between text-right text-xs tabular-nums">
          {yLabels.map((v, i) => <span key={i}>{v}</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-[240px] border-b border-jw-border bg-[repeating-linear-gradient(to_bottom,rgba(136,136,136,0.16)_0,rgba(136,136,136,0.16)_1px,transparent_1px,transparent_25%)]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
              <defs>
                <linearGradient id="g-rep" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={BRAND} stopOpacity="0.22" /><stop offset="1" stopColor={BRAND} stopOpacity="0.04" />
                </linearGradient>
                <linearGradient id="g-enq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={BRAND} stopOpacity="0.75" /><stop offset="1" stopColor={BRAND} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area(yr)} fill="url(#g-rep)" />
              <path d={line(yr)} fill="none" stroke={BRAND} strokeOpacity="0.35" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <path d={area(ye)} fill="url(#g-enq)" />
              <path d={line(ye)} fill="none" stroke={BRAND} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </svg>
            {xs.map((x, i) => (
              <span key={`d${i}`} aria-hidden="true" className="absolute -ml-[3.5px] -mt-[3.5px] h-[7px] w-[7px] rounded-full bg-jw-olive-deep" style={{ left: `${x}%`, top: `${ye[i]}%` }} />
            ))}
            {xs.map((x, i) => {
              const w = 100 / n;
              return (
                <div key={i} tabIndex={0} role="img" aria-label={`${labels[i]}: ${enq[i]} enquiries in, ${rep[i]} replies out`}
                  className="absolute bottom-0 top-0 cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-jw-olive-deep"
                  style={{ left: `${Math.max(0, x - w / 2)}%`, width: `${w}%` }}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
              );
            })}
            {hover !== null && (
              <>
                <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 w-px bg-jw-ink opacity-30" style={{ left: `${xs[hover]}%` }} />
                <div role="status" className="pointer-events-none absolute top-2 z-[2] -translate-x-1/2 whitespace-nowrap bg-jw-ink px-3 py-2 text-[13px] leading-snug text-white"
                  style={{ left: `${Math.min(Math.max(xs[hover], 12), 88)}%` }}>
                  <span className="text-xs text-jw-mid-gray">{labels[hover]}</span><br />
                  <span className="font-semibold">{enq[hover]} enquiries in</span><br />
                  <span className="text-jw-mid-gray">{rep[hover]} replies out</span>
                </div>
              </>
            )}
          </div>
          <div className="relative mt-1.5 h-4 text-xs">
            {labels.map((t, i) => (i % step === 0 || i === n - 1) && (
              <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${xs[i]}%` }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Donut: each slice is a shade of the one brand olive, biggest = darkest. Legend lists counts and %. */
const SHADES = [1, 0.7, 0.45, 0.28, 0.14];
function Donut({ title, subtitle, rows }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  const R = 15.9155; // circumference = 100, so dash lengths are percentages
  let offset = 25;
  return (
    <Card className="flex-[1_1_280px]" title={title} subtitle={subtitle}>
      {total === 0 ? <Empty>No enquiries yet.</Empty> : (
        <div className="flex flex-wrap items-center gap-5 px-5 py-4">
          <svg viewBox="0 0 42 42" className="h-[132px] w-[132px] flex-none" role="img" aria-label={`${title}: ${rows.map((r) => `${r.label} ${r.n}`).join(', ')}`}>
            <circle cx="21" cy="21" r={R} fill="none" stroke="#EEEEEE" strokeWidth="6" />
            {rows.map((r, i) => {
              const pct = (r.n / total) * 100;
              const el = <circle key={r.label} cx="21" cy="21" r={R} fill="none" stroke={BRAND} strokeOpacity={SHADES[Math.min(i, SHADES.length - 1)]}
                strokeWidth="6" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} />;
              offset -= pct;
              return el;
            })}
            <text x="21" y="20.5" textAnchor="middle" className="fill-jw-ink font-head" fontSize="8" fontWeight="600">{total}</text>
            <text x="21" y="26.5" textAnchor="middle" className="fill-jw-gray" fontSize="3.2">enquiries</text>
          </svg>
          <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0">
            {rows.map((r, i) => (
              <li key={r.label} className="flex items-center gap-2.5">
                <span aria-hidden="true" className="h-3 w-3 flex-none bg-jw-olive-deep" style={{ opacity: SHADES[Math.min(i, SHADES.length - 1)] }} />
                <span className="min-w-0 flex-1 truncate text-jw-ink">{r.label}</span>
                <span className="font-semibold tabular-nums text-jw-ink">{r.n}</span>
                <span className="w-10 text-right text-[13px] tabular-nums">{Math.round((r.n / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function Home() {
  const [range, setRange] = useState('day');
  const { data, error, loading, reload } = useAsync(() => getHome(range), [range]);
  useLiveEnquiries(() => reload()); // numbers and "Needs You Now" follow new mail on their own
  const columns = [
    { key: 'name', label: 'Name', className: 'font-semibold text-jw-ink' },
    { key: 'subject', label: 'Subject', className: 'truncate' },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: 'next', label: 'Next step', render: (r) => <span className="whitespace-nowrap font-semibold text-jw-olive-deep">{r.next.label} &rarr;</span> },
  ];
  const header = <PageHeader title="Home" purpose="Your work for today, in the order you do it." />;
  if (error && !data) return <>{header}<ErrorState error={error} onRetry={reload} /></>;
  if (!data) return <>{header}<Loading what="Loading your work" /></>;
  const { counts, needsYou, chart, analytics } = data;
  const first = needsYou[0];
  const stats = [
    { n: counts.total, h: 'Total', s: 'All enquiries so far.', to: '/enquiries' },
    { n: counts.newEnquiries, h: 'New', s: 'Not opened yet.', to: '/enquiries' },
    { n: counts.needReplies, h: 'Need replies', s: 'Customer wrote last.', to: '/enquiries' },
    { n: counts.answered, h: 'Answered', s: 'We have replied at least once.', to: '/enquiries' },
    { n: counts.followUpsDue, h: 'Follow-ups to do', s: 'Due today or overdue.', to: '/follow-ups' },
    { n: counts.followUps, h: 'Follow-ups scheduled', s: 'Going out later.', to: '/follow-ups' },
  ];
  const bannerText = counts.newEnquiries
    ? `${counts.newEnquiries} new ${counts.newEnquiries === 1 ? 'enquiry has' : 'enquiries have'} an AI draft ready. Read each one and press Send.`
    : first ? 'No new enquiries. Work through the list below, top to bottom.' : 'Nothing needs you right now. New mail appears here automatically.';
  return (
    <>
      {header}
      <p className="mb-4 border-l-4 border-jw-magenta bg-white px-4 py-2.5 text-[14px] text-jw-ink">
        For demo purposes, send emails to <a className="font-semibold underline" href="mailto:team.exopai@gmail.com">team.exopai@gmail.com</a>
      </p>
      {error && <ErrorState error={error} onRetry={reload} />}
      <NextBanner label="Start here" text={bannerText}
        action={<Button variant="primary" to={first ? first.next.to || `/enquiries/${first.id}` : '/enquiries'} className="px-5">Open First Enquiry</Button>} />
      <section aria-label="Stats" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((p) => (
          <Link key={p.h} to={p.to} className="flex min-w-0 flex-col gap-1 rounded-card border border-jw-border bg-white px-5 py-4 hover:border-jw-olive-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-jw-olive-deep">
            <span className="text-xs font-semibold uppercase tracking-wide text-jw-olive-deep">{p.h}</span>
            <span className="font-head text-[34px] font-semibold leading-tight tracking-tight tabular-nums text-jw-ink">{p.n}</span>
            <span className="text-[13px]">{p.s}</span>
          </Link>
        ))}
      </section>
      <Chart chart={chart} periods={analytics.periods} range={range} setRange={setRange} />
      <div className="flex flex-wrap items-start gap-4">
        <Donut title="By Category" subtitle="What the AI filed it as." rows={analytics.byCategory} />
        <Donut title="By Trip Type" subtitle="Hotel, package, tour…" rows={analytics.byTravel} />
        <Donut title="By Source" subtitle="Where they wrote to us." rows={analytics.bySource} />
      </div>
      <Card aria-labelledby="h-new" title={<span id="h-new">Needs You Now</span>} subtitle="Click a row. The last column is what you do."
        right={<Link to="/enquiries" className="text-[13px] font-semibold text-jw-olive-deep">View all</Link>}>
        {needsYou.length
          ? <Table columns={columns} rows={needsYou} rowTo={(r) => r.next.to || `/enquiries/${r.id}`} minWidth={560} template="1.1fr 2fr 130px 120px" />
          : <Empty>Nothing needs you right now. New mail appears here automatically.</Empty>}
      </Card>
      {loading && <Loading what="Refreshing" />}
    </>
  );
}
