import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';
import { useAuth, signOut } from '../lib/auth.jsx';
import CommandPalette, { isMac } from './CommandPalette.jsx';
import { Kbd } from './ui.jsx';
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
  return (
    <div className="flex items-center gap-3 rounded-card border border-jw-line bg-jw-offwhite p-2.5">
      <span aria-hidden="true" className="inline-flex h-9 w-9 flex-none items-center justify-center bg-jw-olive-deep font-head text-sm font-semibold text-white">
        {initials(user?.user_metadata?.full_name || user?.email)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13.5px] font-semibold capitalize text-jw-ink">{name}</span>
        <span className="truncate text-[12px] text-jw-gray" title={user?.email}>Reservations team</span>
      </div>
      <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out"
        className="inline-flex h-9 w-9 flex-none items-center justify-center text-jw-gray hover:bg-white hover:text-jw-magenta">
        <Icon name="logout" />
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
