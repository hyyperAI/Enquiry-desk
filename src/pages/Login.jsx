import { useState } from 'react';
import { signIn } from '../lib/auth.jsx';
import { Field, inputCls } from '../components/ui.jsx';
import logo from '../assets/jetwing-logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await signIn(email, password);
    if (error) setError(error.message);
    setBusy(false);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-jw-offwhite p-6">
      <form onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-4 rounded-card border border-jw-border border-t-[3px] border-t-jw-olive-deep bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col items-start gap-3 border-b border-jw-line pb-5">
          <img src={logo} alt="Jetwing Travels, Sri Lanka" width="259" height="55" className="h-auto w-[200px]" draggable="false" />
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-jw-magenta" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-jw-gray">Enquiry Desk</span>
          </div>
        </div>
        <div>
          <h1 className="m-0 font-head text-2xl font-bold tracking-tight text-jw-ink">Sign in</h1>
          <p className="mt-1">Jetwing Travels reservations team.</p>
        </div>
        <Field label="Email"><input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <div role="alert" className="border-l-4 border-jw-ink bg-jw-offwhite px-3 py-2 text-jw-ink">{error}</div>}
        <button type="submit" disabled={busy} className="inline-flex min-h-[44px] items-center justify-center border border-jw-magenta-dark bg-jw-magenta px-5 font-medium text-white disabled:opacity-60">{busy ? 'Signing in…' : 'Sign In'}</button>
        <p className="text-[13px]">New staff are added by the admin in Supabase (Authentication, Users).</p>
      </form>
    </div>
  );
}
