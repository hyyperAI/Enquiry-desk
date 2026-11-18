import { useState } from 'react';
import { Card, Badge, Button, Field, Loading, ErrorState, inputCls, cx, SettingsTabs } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { getGmailStatus, mcpInfo } from '../lib/api';

const CHAT_APPS = ['WhatsApp', 'Facebook', 'Instagram'];
import { useAuth, changePassword } from '../lib/auth';

const KV = ({ k, children, className = '' }) => (
  <div className={cx('flex justify-between gap-3 border-b border-dashed border-jw-border py-2 last:border-b-0', className)}>
    <span>{k}</span>{children}
  </div>
);

export default function Settings() {
  const { user } = useAuth();
  const gmail = useAsync(() => getGmailStatus(), []);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 8) return setMsg({ ok: false, text: 'The new password needs at least 8 characters.' });
    if (next !== confirm) return setMsg({ ok: false, text: 'The two new passwords do not match.' });
    setBusy(true); setMsg(null);
    const { error } = await changePassword(user.email, cur, next);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Password changed.' });
    if (!error) { setCur(''); setNext(''); setConfirm(''); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-head text-[28px] font-bold leading-tight tracking-tight text-jw-ink">Settings</h1>
        <p className="mt-1 max-w-[720px] text-[15px]">Check that Gmail is connected, and manage your login. Nothing here is needed day to day.</p>
        <SettingsTabs current="Settings" />
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="flex-[1_1_440px]" title="Connections" subtitle="Where customer messages come from. Connections are made in n8n.">
          <div className="flex flex-col px-5 py-2">
            <div className="flex flex-col gap-2 border-b border-jw-line py-3">
              <div className="flex items-center justify-between gap-3">
                <b className="text-jw-ink">Gmail AI access (MCP)</b>
                <Badge tone={mcpInfo.url ? 'pale' : 'line'}>{mcpInfo.url ? 'Set' : 'Not set'}</Badge>
              </div>
              <span className="break-all text-[13px]">{mcpInfo.url || 'Not set. Add VITE_MCP_URL to .env.'}</span>
              <div className="flex flex-wrap gap-2">
                {mcpInfo.tools.map((t) => <span key={t} className="inline-flex items-center rounded-card bg-jw-pale px-3 py-1.5 text-[13px] font-semibold text-jw-olive-deep">{t}</span>)}
              </div>
              <span className="text-[13px]">The AI can read and draft. Sending always needs you.</span>
            </div>
            {CHAT_APPS.map((app) => (
              <div key={app} className="flex flex-wrap items-center justify-between gap-3 border-b border-jw-line py-3 last:border-b-0">
                <span><b className="text-jw-ink">{app}</b><br /><span className="text-[13px]">Coming soon: needs the n8n connection workflow</span></span>
                <span className="flex items-center gap-2">
                  <Badge tone="line">Not connected</Badge>
                  <Button disabled className="opacity-60" aria-label={`Connect ${app} (coming soon)`}>Connect</Button>
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex-[1_1_440px]" title="Gmail"
          right={gmail.data && <Badge tone={gmail.data.looksConnected ? 'pale' : 'ink'}>{gmail.data.looksConnected ? 'Connected' : 'Check connection'}</Badge>}>
          {gmail.loading && !gmail.data ? <Loading /> : gmail.error ? <div className="p-4"><ErrorState error={gmail.error} onRetry={gmail.reload} /></div> : (
            <div className="flex flex-col gap-3.5 px-5 py-4">
              <div>
                <KV k="Last mail received"><span className="font-semibold text-jw-ink">{gmail.data.lastMail}</span></KV>
                <KV k="Last workflow error"><span className="font-medium text-jw-ink">{gmail.data.lastError}</span></KV>
              </div>
              <span className="text-[13px]">
                Gmail is connected inside n8n, not here. If no mail has arrived for 3 days, the badge asks you to check that n8n connection.
              </span>
            </div>
          )}
        </Card>

        <Card className="flex-[1_1_440px]" title="Account">
          <form onSubmit={submit} className="flex flex-col gap-3.5 px-5 py-4">
            <KV k="Your login" className="border-b-0 py-0"><span className="font-semibold text-jw-ink">{user?.email}</span></KV>
            <Field label="Current password">
              <input className={inputCls} type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
            </Field>
            <Field label="New password">
              <input className={inputCls} type="password" autoComplete="new-password" placeholder="At least 8 characters" required value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <Field label="New password again">
              <input className={inputCls} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {msg && <div role={msg.ok ? 'status' : 'alert'} className={cx('px-3 py-2 text-jw-ink', msg.ok ? 'bg-jw-pale' : 'border-l-4 border-jw-ink bg-jw-offwhite')}>{msg.text}</div>}
            <Button type="submit" variant="primary" className="self-start disabled:opacity-60" disabled={busy}>{busy ? 'Saving…' : 'Change Password'}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
