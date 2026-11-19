import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { useAuth, signOut } from '../lib/auth.jsx';
import CommandPalette, { isMac } from './CommandPalette.jsx';
import { Kbd } from './ui.jsx';
import { failedFollowUpCount } from '../lib/api.js';
import logo from '../assets/jetwing-logo.png';

// Ordered the way a reservation moves: it comes in, we answer, we quote, we follow up.
const groups = [
  { label: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: 'grid', end: true },
  ] },
  { label: 'Reservations', items: [
    { to: '/enquiries', label: 'Enquiries', icon: 'inbox' },
    { to: '/chats', label: 'Chats', icon: 'chat' },
    { to: '/quotes', label: 'Hotels & Quotes', icon: 'hotel' },
    { to: '/follow-ups', label: 'Follow-ups', icon: 'clock' },
    { to: '/voice-agents', label: 'Voice Agents', icon: 'phone' },
  ] },
  { label: 'Configuration', items: [
    { to: '/ai-agent', label: 'AI Agent', icon: 'spark' },
    { to: '/templates', label: 'Email Templates', icon: 'template' },
    { to: '/settings', label: 'Settings', icon: 'sliders' },
  ] },
];

const initials = (s = '') => (s.split('@')[0].split(/[.\s_-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase();

function Brand() {
  return (
    <div className="flex flex-col items-start gap-3 px-3">
      <img src={logo} alt="Jetwing Travels, Sri Lanka" width="259" height="55" className="h-auto w-[176px] select-none" draggable="false" />
      <div className="flex w-full items-center gap-2 border-t border-jw-line pt-3">
        <span aria-hidden="true" className="inline-block h-2 w-2 bg-jw-magenta" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-jw-gray">Enquiry Desk</span>
      </div>
    </div>
  );
}

function Nav({ onNavigate }) {
  // Failed follow-ups get a badge so nobody misses them. Refreshed on every page change.
  const { pathname } = useLocation();
  const [failed, setFailed] = useState(0);
  useEffect(() => { failedFollowUpCount().then(setFailed).catch(() => {}); }, [pathname]);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-0.5">
          <span className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-jw-mid-gray">{g.label}</span>
          {g.items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate}
              className={({ isActive }) =>
                'group relative flex min-h-[42px] items-center gap-3 rounded-card px-3 text-[14.5px] transition-colors ' +
                (isActive ? 'bg-jw-pale font-semibold text-jw-olive-deep' : 'font-medium text-jw-gray hover:bg-jw-offwhite hover:text-jw-ink')}>
              {({ isActive }) => (
                <>
                  <span aria-hidden="true" className={'absolute inset-y-2 left-0 w-[3px] ' + (isActive ? 'bg-jw-olive-deep' : 'bg-transparent')} />
                  <Icon name={it.icon} className={isActive ? 'text-jw-olive-deep' : 'text-jw-mid-gray group-hover:text-jw-gray'} />
                  <span className="truncate">{it.label}</span>
                  {it.to === '/follow-ups' && failed > 0 && (
                    <span aria-label={`${failed} failed`} className="ml-auto rounded-card bg-jw-magenta px-[7px] py-px text-xs font-semibold tabular-nums text-white">{failed}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </div>
  );
}

function UserCard({ user }) {
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Staff';
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setConfirm(false); } };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); setConfirm(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const doSignOut = async () => {
    setBusy(true);
    try { await signOut(); } finally { setBusy(false); setOpen(false); navigate('/', { replace: true }); }
  };

  const item = 'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-[13.5px] text-jw-ink hover:bg-jw-offwhite';

  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" aria-label="Account" className="absolute bottom-full left-0 right-0 z-30 mb-2 border border-jw-border bg-white shadow-[0_8px_24px_rgba(0,0,0,.12)]">
          <div className="border-b border-jw-line px-3 py-2.5">
            <span className="block truncate text-[13.5px] font-semibold capitalize text-jw-ink">{name}</span>
            <span className="block truncate text-[12px] text-jw-gray">{user?.email}</span>
          </div>
          <NavLink role="menuitem" to="/settings" onClick={() => setOpen(false)} className={item}>
            <Icon name="sliders" /> Account settings
          </NavLink>
          {!confirm ? (
            <button role="menuitem" type="button" onClick={() => setConfirm(true)} className={item + ' border-t border-jw-line text-jw-magenta-dark'}>
              <Icon name="logout" /> Sign out
            </button>
          ) : (
            <div className="flex flex-col gap-2 border-t border-jw-line px-3 py-2.5">
              <span className="text-[13px] text-jw-ink">Sign out of Enquiry Desk?</span>
              <div className="flex gap-2">
                <button type="button" onClick={doSignOut} disabled={busy} autoFocus
                  className="inline-flex min-h-[34px] flex-1 cursor-pointer items-center justify-center bg-jw-magenta px-3 text-[13px] font-medium text-white disabled:opacity-60">
                  {busy ? 'Signing out…' : 'Sign out'}
                </button>
                <button type="button" onClick={() => setConfirm(false)}
                  className="inline-flex min-h-[34px] flex-1 cursor-pointer items-center justify-center border border-jw-border bg-white px-3 text-[13px] text-jw-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <button type="button" onClick={() => { setOpen((o) => !o); setConfirm(false); }} aria-haspopup="menu" aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-jw-line bg-jw-offwhite p-2.5 text-left hover:border-jw-border hover:bg-white">
        <span aria-hidden="true" className="inline-flex h-9 w-9 flex-none items-center justify-center bg-jw-olive-deep font-head text-sm font-semibold text-white">
          {initials(user?.user_metadata?.full_name || user?.email)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13.5px] font-semibold capitalize text-jw-ink">{name}</span>
          <span className="truncate text-[12px] text-jw-gray" title={user?.email}>Reservations team</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className={'flex-none text-jw-gray transition-transform ' + (open ? 'rotate-180' : '')}><path d="M6 15l6-6 6 6" /></svg>
      </button>
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const search = (
    <button type="button" onClick={() => { setMenuOpen(false); setSearchOpen(true); }} aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
      className="flex min-h-[40px] w-full items-center gap-2.5 rounded-card border border-jw-border bg-white px-3 text-left text-[14px] text-jw-mid-gray transition-colors hover:border-jw-olive-deep hover:text-jw-gray">
      <Icon name="search" size={16} />
      <span className="min-w-0 flex-1 truncate">Search enquiries…</span>
      <Kbd>{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-jw-offwhite md:flex-row">
      <CommandPalette open={searchOpen} setOpen={setSearchOpen} />

      {/* Phone / small tablet: top bar with the logo and a menu button. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-jw-border bg-white px-4 py-3 md:hidden">
        <img src={logo} alt="Jetwing Travels, Sri Lanka" width="259" height="55" className="h-auto w-[140px]" />
        <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="main-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'} className="inline-flex h-10 w-10 items-center justify-center text-jw-ink">
          <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
        </button>
      </header>

      <nav id="main-nav" aria-label="Main"
        className={(menuOpen ? 'flex' : 'hidden') + ' flex-col gap-6 border-b border-jw-border bg-white px-3 py-5 md:sticky md:top-0 md:flex md:h-screen md:w-[264px] md:flex-none md:overflow-y-auto md:border-b-0 md:border-r md:py-7'}>
        <div className="hidden md:block"><Brand /></div>
        <div className="px-1">{search}</div>
        <Nav onNavigate={() => setMenuOpen(false)} />
        <div className="mt-auto flex flex-col gap-3 px-1 pt-2">
          <UserCard user={user} />
          <span className="px-2 text-[11px] text-jw-mid-gray">© {new Date().getFullYear()} Jetwing Travels (Pvt) Ltd</span>
        </div>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col gap-5 p-5 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
