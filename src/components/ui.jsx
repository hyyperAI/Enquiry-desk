import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const cx = (...c) => c.filter(Boolean).join(' ');

/**
 * The same customer header on every step of one enquiry: name, subject, email, status,
 * Close button, and the Reply / Send quote / Follow up steps.
 * `e` needs { id, name, subject, email, status, rawStatus }. `step` is 1, 2 or 3.
 */
const STATUS_OPTIONS = ['New', 'Answered', 'In progress', 'Follow-up', 'Resolved'];

export function EnquiryHeader({ e, step, done, onStatusChange }) {
  const steps = [
    { title: 'Reply', hint: 'You or the AI writes', to: `/enquiries/${e.id}` },
    { title: 'Send quote', hint: 'If they asked for prices', to: `/enquiries/${e.id}/quote` },
    { title: 'Follow up', hint: 'If they go quiet', to: `/enquiries/${e.id}/follow-up` },
  ];
  return (
    <>
      <PageHeader title={e.name} purpose={<>{e.subject || '(no subject)'} &nbsp;&middot;&nbsp; {e.email}</>}
        back={{ to: '/enquiries', label: 'Back to enquiries' }}
        actions={<>
          {onStatusChange && e.rawStatus !== 'closed' ? (
            <select aria-label="Enquiry status" value={e.status}
              onChange={(ev) => onStatusChange(ev.target.value)}
              className="self-center rounded-card border border-jw-border bg-white px-2.5 py-1.5 text-xs font-semibold text-jw-ink">
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          ) : e.status && <span className="self-center"><Badge tone={statusTone(e.status)}>{e.status}</Badge></span>}
          {e.rawStatus !== 'closed' && <Button to={`/enquiries/${e.id}/close`}>Close Enquiry</Button>}
        </>} />
      <FlowStrip current={done ? step + 1 : step} items={steps} label={`Steps for ${e.name}`} />
    </>
  );
}

/** Page title + one-line purpose (the 5-second rule). `back` and `actions` are optional. */
export function PageHeader({ title, purpose, back, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        {back && <Link to={back.to} className="inline-flex min-h-[32px] items-center font-medium text-jw-olive-deep">&lt; {back.label}</Link>}
        <h1 className="m-0 font-head text-[28px] font-bold leading-tight tracking-tight text-jw-ink">{title}</h1>
        <p className="mt-1 max-w-[720px] text-[15px]">{purpose}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const STEPS = [
  { title: 'Enquiry in', hint: 'AI reads the mail', to: '/enquiries' },
  { title: 'Send reply', hint: 'AI drafts, you send', },
  { title: 'Send quote', hint: 'Fill the form, send', to: '/quotes' },
  { title: 'Follow up', hint: 'If no answer in 2 days', to: '/follow-ups' },
  { title: 'Close', hint: 'Booked or lost', },
];

/** The 5-step strip for one enquiry. `current` is 1 to 5. Pass `items` to show a different, non-link list. */
export function FlowStrip({ current, items, label = 'Steps for one enquiry' }) {
  const list = items || STEPS;
  return (
    <nav aria-label={label} className="flex flex-wrap overflow-hidden rounded-card border border-jw-border bg-white">
      {list.map((s, i) => {
        const n = i + 1;
        const on = current === n;
        const done = current ? n < current : !!items;
        const cls = cx(
          'flex min-h-[60px] flex-[1_1_150px] items-center gap-2.5 border-r border-jw-line px-4 py-2 last:border-r-0',
          on ? 'bg-jw-olive-deep text-white' : 'text-jw-gray'
        );
        const body = (
          <>
            <i className={cx('inline-flex h-[26px] w-[26px] flex-none items-center justify-center text-[13px] font-semibold not-italic',
              on ? 'bg-white text-jw-olive-deep' : done ? 'bg-jw-pale text-jw-olive-deep' : 'bg-jw-line text-jw-gray')}>{n}</i>
            <span>
              <b className={cx('block font-semibold leading-tight', on ? 'text-white' : 'text-jw-ink')}>{s.title}</b>
              <small className="block text-xs leading-tight">{s.hint}</small>
            </span>
          </>
        );
        return s.to ? (
          <Link key={s.title} to={s.to} aria-current={on ? 'step' : undefined} className={cls}>{body}</Link>
        ) : (
          <div key={s.title} className={cls}>{body}</div>
        );
      })}
    </nav>
  );
}

/** "What to do now" banner: one label, one sentence, optional action. */
export function NextBanner({ label, text, action, role = 'region' }) {
  return (
    <div role={role} aria-label={role === 'region' ? label : undefined} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-l-4 border-jw-olive-deep bg-jw-pale px-5 py-4 text-jw-ink">
      <span>
        <span className="block text-xs font-semibold uppercase tracking-wide text-jw-olive-deep">{label}</span>
        <span className="block font-head text-[17px] font-semibold leading-snug tracking-tight">{text}</span>
      </span>
      {action}
    </div>
  );
}

export function Card({ title, subtitle, right, children, className = '', accent = false, ...rest }) {
  return (
    <section className={cx('min-w-0 rounded-card border border-jw-border bg-white', accent && 'border-t-[3px] border-t-jw-olive-deep', className)} {...rest}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 border-b border-jw-border px-5 py-3.5">
          <div>
            {title && <h2 className="m-0 font-head text-base font-semibold tracking-tight text-jw-ink">{title}</h2>}
            {subtitle && <span className="text-[13px]">{subtitle}</span>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const BADGE = {
  blue: 'bg-jw-olive-deep text-white',
  pale: 'bg-jw-pale text-jw-olive-deep',
  ink: 'bg-jw-ink text-white',
  line: 'border border-jw-border bg-white text-jw-gray px-[9px] py-[3px]',
};
export function Badge({ tone = 'pale', children }) {
  return <span className={cx('inline-block whitespace-nowrap rounded-card px-2.5 py-1 text-xs font-semibold', BADGE[tone])}>{children}</span>;
}

/** Map an enquiry status to a badge tone. */
export const statusTone = (s) => ({ New: 'blue', Answered: 'pale', 'In progress': 'ink', 'Follow-up': 'ink', Resolved: 'line', Closed: 'line', Failed: 'ink', 'Not sure': 'ink' }[s] || 'pale');

const BTN = {
  primary: 'border-jw-magenta-dark bg-jw-magenta text-white hover:bg-jw-magenta-dark',
  secondary: 'border-jw-olive-deep bg-white text-jw-olive-deep hover:bg-jw-pale',
  dark: 'border-jw-ink bg-jw-ink text-white',
};
const btnCls = (variant, className) =>
  cx('inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 border px-[18px] font-medium', BTN[variant], className);

/** Button. Pass `to` for an in-app link, `href` for an external link, otherwise it is a <button>. */
export function Button({ variant = 'secondary', to, href, className = '', children, ...rest }) {
  if (to) return <Link to={to} className={btnCls(variant, className)} {...rest}>{children}</Link>;
  if (href) return <a href={href} className={btnCls(variant, className)} {...rest}>{children}</a>;
  return <button type="button" className={btnCls(variant, className)} {...rest}>{children}</button>;
}

/** Filter chip with a count. */
export function Chip({ on, count, children, ...rest }) {
  return (
    <button type="button" aria-pressed={on} className={cx('inline-flex min-h-[40px] items-center gap-2 border px-3.5 font-medium',
      on ? 'border-jw-olive-deep bg-jw-olive-deep font-semibold text-white' : 'border-jw-border bg-white text-jw-gray')} {...rest}>
      {children}{count !== undefined && <span className="tabular-nums opacity-80">{count}</span>}
    </button>
  );
}

/** Switch (role="switch"). */
export function Toggle({ checked, onChange, label, labelledBy }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={cx('relative h-[26px] w-11 flex-none', checked ? 'bg-jw-olive-deep' : 'bg-jw-border')}>
      <span className={cx('absolute top-[3px] h-5 w-5 bg-white transition-all', checked ? 'left-[21px]' : 'left-[3px]')} />
    </button>
  );
}

/** Segmented control: options is an array of strings. */
export function Segmented({ options, value, onChange, labelledBy }) {
  return (
    <span role="group" aria-labelledby={labelledBy} className="inline-flex flex-none border border-jw-border">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}
          className={cx('inline-flex min-h-[40px] min-w-[64px] items-center justify-center px-2.5 font-medium',
            value === o ? 'bg-jw-olive-deep font-semibold text-white' : 'bg-white text-jw-gray')}>{o}</button>
      ))}
    </span>
  );
}

export const inputCls = 'box-border h-11 w-full border border-jw-border bg-white px-3.5 font-body text-sm text-jw-ink placeholder:text-jw-mid-gray';
export const textareaCls = 'box-border w-full resize-y border border-jw-border bg-white px-3.5 py-2.5 font-body text-sm leading-relaxed text-jw-ink';

/** Label above a field, uppercase small caps style. */
export function Field({ label, className = '', children }) {
  return (
    <label className={cx('flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[.25px] text-jw-gray', className)}>
      {label}
      <span className="normal-case tracking-normal">{children}</span>
    </label>
  );
}

/** Simple data table. columns: [{ key, label, className, render(row) }]. rowTo(row) makes rows links. */
export function Table({ columns, rows, rowTo, minWidth = 600, template, selected }) {
  const style = { gridTemplateColumns: template };
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>
        <div style={style} className="grid gap-4 border-b border-jw-line bg-jw-offwhite px-5 py-2.5 text-xs font-semibold uppercase tracking-[.25px]">
          {columns.map((c) => <span key={c.key}>{c.label}</span>)}
        </div>
        {rows.map((r, i) => {
          const cells = columns.map((c) => <span key={c.key} className={cx('min-w-0', c.className)}>{c.render ? c.render(r) : r[c.key]}</span>);
          const cls = cx('grid min-h-[56px] items-center gap-4 border-b border-jw-line px-5 last:border-b-0 hover:bg-jw-offwhite',
            selected === i && 'bg-jw-pale shadow-[inset_3px_0_0_#737101]');
          return rowTo ? <Link key={i} to={rowTo(r)} style={style} className={cls}>{cells}</Link> : <div key={i} style={style} className={cls}>{cells}</div>;
        })}
      </div>
    </div>
  );
}

/** Small key-style label, e.g. for "Enter". */
export const Kbd = ({ children }) => <span className="inline-block border border-jw-border bg-white px-[7px] py-px text-xs font-semibold text-jw-ink">{children}</span>;

/** Confirmation shown after an action (e.g. queued to send). */
export function SentNotice({ children, onUndo }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2.5 bg-jw-pale px-3.5 py-3 text-jw-ink">
      <span>{children}</span>
      {onUndo && <Button onClick={onUndo}>Undo</Button>}
    </div>
  );
}

/** Tab bar shared by the AI Agent and Settings pages. `current` is 'AI Agent' or 'Settings'. */
export function SettingsTabs({ current }) {
  return (
    <nav aria-label="Settings tabs" className="mt-3 flex border-b border-jw-border">
      {[['AI Agent', '/ai-agent'], ['Settings', '/settings']].map(([name, to]) => (
        <Link key={to} to={to} aria-current={current === name ? 'page' : undefined}
          className={cx('inline-flex min-h-[44px] items-center border-b-2 px-4 font-medium',
            current === name ? 'border-jw-olive-deep font-semibold text-jw-olive-deep' : 'border-transparent text-jw-gray')}>{name}</Link>
      ))}
    </nav>
  );
}

/** Combobox: type-ahead search with a dropdown of results. `onSearch(term)` returns a promise of items. `renderItem(item)` renders each row. `onSelect(item)` fires on pick. `onFreeEntry(text)` fires when the user picks the free-entry option. */
export function Combobox({ placeholder, onSearch, renderItem, onSelect, onFreeEntry, freeEntryLabel, autoFocus }) {
  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const search = (val) => {
    setText(val);
    setActive(-1);
    clearTimeout(timer.current);
    if (!val.trim()) { setItems([]); setOpen(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try { const r = await onSearch(val); setItems(r); setOpen(true); }
      catch { setItems([]); }
      finally { setLoading(false); }
    }, 250);
  };

  const pick = (item) => { setText(''); setOpen(false); setItems([]); onSelect(item); };
  const free = () => { const v = text.trim(); if (v && onFreeEntry) { onFreeEntry(v); setText(''); setOpen(false); setItems([]); } };

  const showFree = onFreeEntry && text.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text.trim());
  const totalItems = items.length + (showFree ? 1 : 0);

  const onKey = (e) => {
    if (!open && e.key !== 'ArrowDown') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, totalItems - 1)); setOpen(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && active < items.length) pick(items[active]);
      else if (active === items.length && showFree) free();
    }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!listRef.current?.contains(e.target) && !inputRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative">
      <input ref={inputRef} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls="combo-list"
        className={inputCls} placeholder={placeholder} value={text} onChange={(e) => search(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus} />
      {loading && <span className="absolute right-3 top-3 text-xs text-jw-gray">Searching…</span>}
      {open && totalItems > 0 && (
        <ul id="combo-list" ref={listRef} role="listbox" className="absolute left-0 right-0 top-full z-20 max-h-[280px] overflow-y-auto border border-jw-border bg-white shadow-lg">
          {items.map((item, i) => (
            <li key={i} role="option" aria-selected={i === active}
              onMouseDown={() => pick(item)}
              className={cx('cursor-pointer border-b border-jw-line px-4 py-2.5 last:border-b-0', i === active ? 'bg-jw-pale' : 'hover:bg-jw-offwhite')}>
              {renderItem(item)}
            </li>
          ))}
          {showFree && (
            <li role="option" aria-selected={active === items.length}
              onMouseDown={free}
              className={cx('cursor-pointer border-t border-jw-olive-deep bg-jw-offwhite px-4 py-2.5 font-semibold text-jw-olive-deep', active === items.length && 'bg-jw-pale')}>
              {freeEntryLabel ? freeEntryLabel(text.trim()) : `Send to new customer ${text.trim()}`}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export { cx };

/** Loading / error / empty states for data from Supabase. */
export function Loading({ what = 'Loading' }) {
  return <div role="status" className="px-5 py-6 text-jw-gray">{what}…</div>;
}
export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-jw-ink bg-white px-5 py-4 text-jw-ink">
      <span><b>Could not load this.</b> {error?.message || String(error)}</span>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}
export function Empty({ children }) {
  return <div className="px-5 py-6 text-jw-gray">{children}</div>;
}
