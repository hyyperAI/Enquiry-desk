import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon.jsx';
import { Badge, statusTone, Kbd, cx } from './ui.jsx';
import { listEnquiries, peekEnquiry } from '../lib/api';

const PAGES = [
  { label: 'Home', to: '/', icon: 'home', words: 'home dashboard today stats chart' },
  { label: 'Enquiries', to: '/enquiries', icon: 'mail', words: 'enquiries inbox mail list' },
  { label: 'Chats', to: '/chats', icon: 'chat', words: 'chats whatsapp facebook instagram messages' },
  { label: 'Hotels & Quotes', to: '/quotes', icon: 'hotel', words: 'hotels quotes quotation price new quote' },
  { label: 'Follow-ups', to: '/follow-ups', icon: 'clock', words: 'follow-ups followups reminders due scheduled' },
  { label: 'Voice Agents', to: '/voice-agents', icon: 'phone', words: 'voice agents call mandy sophie elevenlabs hotel lead' },
  { label: 'AI Agent', to: '/ai-agent', icon: 'spark', words: 'ai agent knowledge confidence upload' },
  { label: 'Templates', to: '/templates', icon: 'mail', words: 'templates email wording' },
  { label: 'Settings', to: '/settings', icon: 'sliders', words: 'settings gmail password account' },
];

export const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '');

/** Every word typed must appear somewhere in the text. */
const matches = (text, q) => q.split(/\s+/).filter(Boolean).every((w) => text.includes(w));

/**
 * Search-and-jump box, opened with Ctrl+K (Cmd+K on a Mac) or "/".
 * Finds any enquiry by name, email or subject, shows its trip at a glance,
 * and jumps straight to the reply, quote, follow-up or close step.
 */
export default function CommandPalette({ open, setOpen }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [peeks, setPeeks] = useState({}); // enquiry id -> { summary, facts } | { error }
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const lastFocus = useRef(null);

  // Open / close from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // Fresh list every time it opens; the last list stays on screen while it reloads.
  useEffect(() => {
    if (!open) { lastFocus.current?.focus?.(); return undefined; }
    lastFocus.current = document.activeElement;
    setQ(''); setSel(0); setError(null); setPeeks({});
    let live = true;
    listEnquiries().then((r) => live && setRows(r)).catch((e) => live && setError(e));
    inputRef.current?.focus();
    return () => { live = false; };
  }, [open]);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = rows || [];
    const enquiryItem = (r, hint) => ({ id: `e-${r.id}`, kind: 'enquiry', row: r, label: r.name, sub: r.subject, hint, to: `/enquiries/${r.id}` });
    const pageItem = (p) => ({ id: `p-${p.to}`, kind: 'page', icon: p.icon, label: p.label, to: p.to });
    if (!s) {
      return [
        { title: 'Needs you now', items: all.filter((r) => r.next.act).slice(0, 5).map((r) => ({ ...enquiryItem(r, r.next.label), to: r.next.to || `/enquiries/${r.id}` })) },
        { title: 'Go to', items: PAGES.map(pageItem) },
      ].filter((g) => g.items.length);
    }
    const found = all.filter((r) => matches([r.name, r.email, r.subject, r.status].filter(Boolean).join(' ').toLowerCase(), s)).slice(0, 6);
    const top = found[0];
    const first = top?.name.split(' ')[0];
    const actions = top && top.rawStatus !== 'closed' ? [
      { id: `a-quote-${top.id}`, kind: 'action', icon: 'hotel', row: top, label: `Send a quote to ${first}`, to: `/enquiries/${top.id}/quote` },
      { id: `a-follow-${top.id}`, kind: 'action', icon: 'clock', row: top, label: `Follow up with ${first}`, to: `/enquiries/${top.id}/follow-up` },
      { id: `a-close-${top.id}`, kind: 'action', icon: 'lock', row: top, label: `Close ${first}'s enquiry`, to: `/enquiries/${top.id}/close` },
    ] : [];
    return [
      { title: 'Enquiries', items: found.map((r) => enquiryItem(r, r.received)) },
      { title: top ? `Do something for ${top.name}` : '', items: actions },
      { title: 'Go to', items: PAGES.filter((p) => matches(`${p.label} ${p.words}`.toLowerCase(), s)).map(pageItem) },
    ].filter((g) => g.items.length);
  }, [q, rows]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = flat[Math.min(sel, flat.length - 1)] || null;
  const previewRow = current?.row || null;

  // Load the trip details for the highlighted enquiry, once, after a short pause.
  useEffect(() => {
    const id = previewRow?.id;
    if (!open || !id || peeks[id]) return undefined;
    const t = setTimeout(() => {
      peekEnquiry(id).then((p) => setPeeks((m) => ({ ...m, [id]: p }))).catch((e) => setPeeks((m) => ({ ...m, [id]: { error: e } })));
    }, 120);
    return () => clearTimeout(t);
  }, [open, previewRow?.id, peeks]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel, groups]);

  if (!open) return null;

  const go = (item) => { if (!item) return; setOpen(false); navigate(item.to); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => (flat.length ? (Math.min(i, flat.length - 1) + 1) % flat.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => (flat.length ? (Math.min(i, flat.length - 1) - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(current); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'Tab') { e.preventDefault(); } // keep focus in the box
  };

  const peek = previewRow && peeks[previewRow.id];
  let n = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[10vh] motion-safe:animate-[cp-fade_.12s_ease-out]" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Search and jump"
        className="flex max-h-[76vh] w-full max-w-[880px] flex-col overflow-hidden rounded-card border border-jw-border bg-white shadow-[0_24px_64px_rgba(0,0,0,0.28)] motion-safe:animate-[cp-rise_.16s_ease-out]"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-jw-border px-5">
          <Icon name="search" size={20} className="flex-none text-jw-olive-deep" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKeyDown}
            role="combobox" aria-expanded="true" aria-controls="cp-list" aria-activedescendant={current ? current.id : undefined} aria-autocomplete="list"
            placeholder="Type a customer's name, email or subject…" autoComplete="off" spellCheck="false"
            className="h-[60px] min-w-0 flex-1 border-0 bg-transparent font-body text-[17px] text-jw-ink outline-none placeholder:text-jw-mid-gray focus-visible:outline-none" />
          <Kbd>Esc</Kbd>
        </div>

        <div className="flex min-h-0 flex-1">
          <div ref={listRef} id="cp-list" role="listbox" aria-label="Results" className="min-h-[260px] min-w-0 flex-1 overflow-y-auto py-2">
            {error && <div role="alert" className="px-5 py-3 text-jw-ink"><b>Could not load enquiries.</b> {error.message}</div>}
            {!rows && !error && <div role="status" className="px-5 py-3">Loading enquiries…</div>}
            {rows && !flat.length && <div className="px-5 py-6">Nothing matches “{q.trim()}”. Try a name, an email or a word from the subject.</div>}
            {groups.map((g) => (
              <div key={g.title} role="group" aria-label={g.title}>
                <div className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-jw-mid-gray">{g.title}</div>
                {g.items.map((it) => {
                  n += 1;
                  const i = n, on = current?.id === it.id;
                  return (
                    <div key={it.id} id={it.id} role="option" aria-selected={on}
                      onMouseMove={() => sel !== i && setSel(i)} onClick={() => go(it)}
                      className={cx('flex min-h-[48px] cursor-pointer items-center gap-3 px-5', on && 'bg-jw-pale shadow-[inset_3px_0_0_#737101]')}>
                      {it.kind === 'enquiry' ? (
                        <>
                          <span aria-hidden="true" className={cx('inline-flex h-8 w-8 flex-none items-center justify-center font-head text-sm font-semibold',
                            on ? 'bg-jw-olive-deep text-white' : 'bg-jw-line text-jw-gray')}>{it.label.charAt(0).toUpperCase()}</span>
                          <span className="min-w-0 flex-1">
                            <b className="block truncate font-semibold leading-tight text-jw-ink">{it.label}</b>
                            <small className="block truncate text-[13px] leading-tight">{it.sub}</small>
                          </span>
                          <Badge tone={statusTone(it.row.status)}>{it.row.status}</Badge>
                          <span className="hidden w-[104px] flex-none truncate text-right text-[13px] sm:block">{it.hint}</span>
                        </>
                      ) : (
                        <>
                          <span className={cx('inline-flex h-8 w-8 flex-none items-center justify-center', on ? 'text-jw-olive-deep' : 'text-jw-gray')}><Icon name={it.icon} /></span>
                          <span className={cx('min-w-0 flex-1 truncate font-medium', on ? 'text-jw-ink' : 'text-jw-gray')}>{it.label}</span>
                        </>
                      )}
                      {on && <span aria-hidden="true" className="flex-none text-jw-olive-deep">&crarr;</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {previewRow && (
            <aside aria-label={`${previewRow.name} at a glance`} aria-live="polite" className="hidden w-[320px] flex-none flex-col gap-3 overflow-y-auto border-l border-jw-border bg-jw-offwhite px-5 py-4 md:flex">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-jw-olive-deep">At a glance</span>
                <b className="block font-head text-[19px] font-semibold leading-tight tracking-tight text-jw-ink">{previewRow.name}</b>
                <span className="block truncate text-[13px]">{previewRow.email}</span>
              </div>
              {!peek && <div role="status">Reading the enquiry…</div>}
              {peek?.error && <div role="alert" className="text-jw-ink">Could not load the details. {peek.error.message}</div>}
              {peek && !peek.error && (
                <>
                  <p className="m-0 border-l-[3px] border-jw-olive-deep bg-white px-3 py-2.5 text-[13px] leading-relaxed text-jw-ink">
                    <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-jw-olive-deep"><Icon name="spark" size={12} />AI summary</span>
                    {peek.summary || 'The AI has not summarised this one yet.'}
                  </p>
                  <dl className="m-0 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                    {peek.facts.map((f) => (
                      <div key={f.k} className="contents">
                        <dt className="font-semibold uppercase tracking-[.25px] text-jw-gray">{f.k}</dt>
                        <dd className={cx('m-0 min-w-0 break-words', f.missing ? 'text-jw-mid-gray' : 'text-jw-ink')}>{f.v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              <div className="mt-auto border-t border-jw-border pt-3 text-[13px]">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-jw-mid-gray">Next step</span>
                <b className="font-semibold text-jw-ink">{previewRow.next.label}</b>
              </div>
            </aside>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-jw-border bg-jw-offwhite px-5 py-2.5 text-xs">
          <span className="flex items-center gap-1.5"><Kbd>&uarr;</Kbd><Kbd>&darr;</Kbd> Move</span>
          <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> Open</span>
          <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> Close</span>
          <span className="ml-auto tabular-nums">{rows ? `${rows.length} enquiries searched` : ''}</span>
        </div>
      </div>
    </div>
  );
}
