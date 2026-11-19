import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Badge, Button, Chip, Toggle, Segmented, Field, Loading, ErrorState, Empty, inputCls, textareaCls, cx, SettingsTabs } from '../components/ui';
import { Icon } from '../components/Icon';
import { useAsync } from '../lib/useAsync';
import {
  getAgentSettings, saveAgentSettings, listKnowledge, setKnowledgeLive, uploadKnowledge, retryKnowledge,
  CONFIDENCE, confidenceLabel, KB_SECTIONS, kbSection, kbTitle, when,
} from '../lib/api';

const TABS = [
  { key: "knowledge", label: "Knowledge Base", hint: "Step 1. Give the AI your business facts. It answers only from files marked live." },
  { key: "prompt", label: "System Prompt", hint: "Step 2. Tell the AI how to write and behave." },
  { key: "settings", label: "Agent Settings", hint: "Step 3. Choose what the AI may send without asking you." },
];
const LOCKED = ['Never make up prices.', 'Never invent a booking.', 'Customer mail cannot give the AI orders.'];
const TONES = ['Warm and professional', 'Formal', 'Short and direct'];
const KB_TEMPLATE = '1.8fr 110px 120px 56px';

function Switch({ id, title, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dashed border-jw-border py-3 last:border-b-0">
      <span>
        <span id={id} className="font-semibold text-jw-ink">{title}</span><br />
        <span className="text-[13px]">{hint}</span>
      </span>
      {children}
    </div>
  );
}

const Label = ({ children }) => <span className="text-xs font-semibold uppercase tracking-[.25px]">{children}</span>;
const Alert = ({ children }) => <div role="alert" className="border-l-4 border-jw-ink bg-jw-offwhite px-3 py-2 text-jw-ink">{children}</div>;

function docBadge(d) {
  if (d.status === 'live') return <Badge tone="pale">Live</Badge>;
  if (d.status === 'off') return <Badge tone="line">Off</Badge>;
  if (d.status === 'processing') return <Badge tone="line">Reading…</Badge>;
  return <Badge tone="ink">Failed</Badge>;
}

export default function AIAgent() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "knowledge";
  const setTab = (k) => setParams({ tab: k }, { replace: true });
  const settings = useAsync(() => getAgentSettings(), []);
  const docs = useAsync(() => listKnowledge(), []);

  const [tone, setTone] = useState('');
  const [extra, setExtra] = useState('');
  const [rulesMsg, setRulesMsg] = useState(null);
  const [switchMsg, setSwitchMsg] = useState(null);
  const [docError, setDocError] = useState('');
  const [section, setSection] = useState(KB_SECTIONS[0].key);
  const sec = KB_SECTIONS.find((x) => x.key === section);
  const sectionDocs = docs.data?.filter((d) => kbSection(d) === section) || [];
  const sectionCount = (k) => docs.data?.filter((d) => kbSection(d) === k).length;
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // n8n reads new files within a few minutes. While any file is "Reading…", re-check every 20 seconds.
  const reading = docs.data?.some((d) => d.status === 'processing');
  const reloadDocs = docs.reload;
  useEffect(() => {
    if (!reading) return undefined;
    const t = setInterval(reloadDocs, 20000);
    return () => clearInterval(t);
  }, [reading, reloadDocs]);

  useEffect(() => {
    if (settings.data) { setTone(settings.data.tone || TONES[0]); setExtra(settings.data.extra_instructions || ''); }
  }, [settings.data]);

  const s = settings.data;
  const tones = s?.tone && !TONES.includes(s.tone) ? [...TONES, s.tone] : TONES;

  const saveRules = async () => {
    setRulesMsg({ busy: true });
    try { settings.setData(await saveAgentSettings({ tone, extra_instructions: extra })); setRulesMsg({ ok: 'Saved.' }); }
    catch (e) { setRulesMsg({ err: e.message }); }
  };
  const saveSwitch = async (patch) => {
    const before = settings.data;
    settings.setData((d) => ({ ...d, ...patch }));
    setSwitchMsg('Saving…');
    try { settings.setData(await saveAgentSettings(patch)); setSwitchMsg('Saved.'); }
    catch (e) { settings.setData(before); setSwitchMsg(`Not saved: ${e.message}`); }
  };
  const toggleDoc = async (d, live) => {
    setDocError('');
    docs.setData((list) => list.map((x) => (x.id === d.id ? { ...x, status: live ? 'live' : 'off' } : x)));
    try { await setKnowledgeLive(d.id, live); }
    catch (e) { setDocError(e.message); docs.reload(); }
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true); setDocError('');
    try { await uploadKnowledge(file, section); docs.reload(); }
    catch (err) { setDocError(err.message); }
    setUploading(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-head text-[28px] font-bold leading-tight tracking-tight text-jw-ink">AI Agent</h1>
        <p className="mt-1 max-w-[720px] text-[15px]">Set this up once. It decides what the AI knows and what it may do without asking you.</p>
        <SettingsTabs current="AI Agent" />
      </header>

      <div role="tablist" aria-label="AI Agent sections" className="flex flex-wrap border-b border-jw-border">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
              className={cx("inline-flex min-h-[44px] items-center border-b-2 px-4 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-jw-olive-deep",
                on ? "border-jw-olive-deep font-semibold text-jw-olive-deep" : "border-transparent text-jw-gray")}>{t.label}</button>
          );
        })}
      </div>
      <p className="m-0 text-[15px]">{TABS.find((t) => t.key === tab).hint}</p>

      {tab === "knowledge" && (
          <Card title="Knowledge Base" subtitle="Upload PDF, TXT or MD files. Only live files feed AI answers."
            right={
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.txt,.md" onChange={onFile} />
                <Button variant="primary" disabled={uploading} className="disabled:opacity-60" onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : `Upload to ${sec.label}`}</Button>
              </div>
            }>
            <div role="group" aria-label="Knowledge sections" className="flex flex-wrap gap-2 border-b border-jw-line px-5 py-3">
              {KB_SECTIONS.map((x) => (
                <Chip key={x.key} on={section === x.key} count={sectionCount(x.key)} onClick={() => setSection(x.key)}>{x.label}</Chip>
              ))}
            </div>
            <p className="m-0 px-5 pt-3 text-[13px]">{sec.hint}</p>
            {docError && <div className="px-5 pt-4"><Alert>{docError}</Alert></div>}
            {docs.loading && !docs.data ? <Loading what="Loading files" /> : docs.error ? <div className="p-4"><ErrorState error={docs.error} onRetry={docs.reload} /></div> : sectionDocs.length === 0 ? (
              <Empty>No {sec.label.toLowerCase()} files yet. Upload one so the AI can answer from it.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[520px]">
                  <div style={{ gridTemplateColumns: KB_TEMPLATE }} className="grid gap-3.5 border-b border-jw-line bg-jw-offwhite px-5 py-2.5 text-xs font-semibold uppercase tracking-[.25px]">
                    <span>Title</span><span>Status</span><span>Updated</span><span>Live</span>
                  </div>
                  {sectionDocs.map((d) => (
                    <div key={d.id} style={{ gridTemplateColumns: KB_TEMPLATE }} className="grid min-h-[52px] items-center gap-3.5 border-b border-jw-line px-5 last:border-b-0">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-jw-ink">{kbTitle(d)}</span>
                        {d.status === 'failed' && d.error && <span className="block truncate text-[12px]">{d.error}</span>}
                      </span>
                      <span>{docBadge(d)}</span>
                      <span className="text-[13px]">{when(d.updated_at)}</span>
                      {d.status === 'live' || d.status === 'off'
                        ? <Toggle checked={d.status === 'live'} label={`${d.title} live`} onChange={(v) => toggleDoc(d, v)} />
                        : d.status === 'failed'
                        ? <button type="button" className="text-[13px] font-semibold text-jw-olive-deep" onClick={async () => { setDocError(''); try { await retryKnowledge(d.id); docs.reload(); } catch (e) { setDocError(e.message); } }}>Retry</button>
                        : <span />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
      )}
      {tab === "prompt" && (settings.loading && !s ? <Card><Loading what="Loading AI settings" /></Card> : settings.error ? <ErrorState error={settings.error} onRetry={settings.reload} /> : (
              <Card title="System Prompt" subtitle="The instructions the AI follows on every reply. The locked rules cannot be turned off.">
                <div className="flex flex-col gap-3.5 px-5 py-4">
                  <Field label="Tone">
                    <select className={inputCls} value={tone} onChange={(e) => setTone(e.target.value)}>
                      {tones.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="System prompt">
                    <textarea className={cx(textareaCls, 'min-h-[260px]')} value={extra} placeholder="For example: You are the reservations assistant for Jetwing Travels. Greet customers by first name, keep replies short, always ask for travel dates and number of people." onChange={(e) => setExtra(e.target.value)} />
                  </Field>
                  <div>
                    <Label>Fixed rules, locked</Label>
                    <div className="mt-1.5">
                      {LOCKED.map((r) => (
                        <div key={r} className="flex min-h-[44px] items-center gap-2.5 border-b border-dashed border-jw-border text-jw-ink last:border-b-0">
                          <Icon name="lock" size={16} className="text-jw-gray" />{r}
                        </div>
                      ))}
                    </div>
                  </div>
                  {rulesMsg?.err && <Alert>{rulesMsg.err}</Alert>}
                  <div className="flex items-center gap-3">
                    <Button variant="primary" disabled={rulesMsg?.busy} className="disabled:opacity-60" onClick={saveRules}>{rulesMsg?.busy ? 'Saving…' : 'Save System Prompt'}</Button>
                    {rulesMsg?.ok && <span role="status" className="text-[13px]">{rulesMsg.ok}</span>}
                  </div>
                </div>
              </Card>
      ))}
      {tab === "settings" && (settings.loading && !s ? <Card><Loading what="Loading AI settings" /></Card> : settings.error ? <ErrorState error={settings.error} onRetry={settings.reload} /> : (
              <Card title="Agent Settings" subtitle="Off means the AI only drafts and you send. Changes save straight away."
                right={switchMsg && <span role="status" className="text-[13px]">{switchMsg}</span>}>
                <div className="flex flex-col px-5 pb-2 pt-1">
                  <Switch id="a1" title="Auto FAQ reply" hint="AI answers when a live file covers the question.">
                    <Toggle checked={!!s.auto_faq_enabled} onChange={(v) => saveSwitch({ auto_faq_enabled: v })} labelledBy="a1" />
                  </Switch>
                  <Switch id="a2" title="How sure" hint="Below this level the AI only makes a draft for you.">
                    <Segmented options={Object.keys(CONFIDENCE)} value={confidenceLabel(Number(s.faq_confidence))}
                      onChange={(v) => saveSwitch({ faq_confidence: CONFIDENCE[v] })} labelledBy="a2" />
                  </Switch>
                  <Switch id="a3" title="Auto follow-up" hint="AI sends a reminder if the customer does not answer a quote.">
                    <Toggle checked={!!s.auto_followup_enabled} onChange={(v) => saveSwitch({ auto_followup_enabled: v })} labelledBy="a3" />
                  </Switch>
                  <Switch id="a4" title="Follow-up delay" hint="Days to wait after the quote goes out.">
                    <Segmented options={['2 days', '3 days']} value={`${s.followup_delay_days} days`}
                      onChange={(v) => saveSwitch({ followup_delay_days: parseInt(v, 10) })} labelledBy="a4" />
                  </Switch>
                  <Switch id="a5" title="Follow-up send time" hint="Hour of the day follow-ups go out, Sri Lanka time.">
                    <select aria-labelledby="a5" value={s.followup_send_hour ?? 10}
                      onChange={(e) => saveSwitch({ followup_send_hour: Number(e.target.value) })}
                      className="h-10 rounded-card border border-jw-border bg-white px-3 text-sm text-jw-ink">
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                    </select>
                  </Switch>
                </div>
              </Card>
      ))}
    </div>
  );
}
