import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { PageHeader, Button, inputCls, cx } from '../components/ui.jsx';

const AGENTS = [
  {
    id: 'agent_9001m7pjdfczfadsvcbfwdpxdz89',
    name: 'Mandy',
    title: 'Lead qualification',
    blurb: 'Calls the lead and asks for their preferred choices: dates, travellers, hotel type and budget.',
    colors: ['#F6F6E6', '#D3D162', '#8C8A01'],
    fields: [
      { key: 'customer_name', label: 'Customer name', type: 'text', def: () => 'there', blank: true, placeholder: 'Usman' },
      { key: 'number_of_people_arriving_for_visits', label: 'People arriving', type: 'number', def: () => '2' },
      { key: 'arriving_date', label: 'Arriving date', type: 'date', def: () => isoDay(new Date()) },
    ],
  },
  {
    id: 'agent_6501m7pzmfq3ecfb44jjmnp9f4bt',
    name: 'Sophie',
    title: 'Hotel inquiry',
    blurb: 'Calls hotels in Sri Lanka and gathers the details we need: free rooms, rates and if the dates fit.',
    colors: ['#FCE4F1', '#F266AE', '#C9036C'],
    fields: [
      { key: 'hotel_name', label: 'Hotel name', type: 'text', def: () => 'Jetwing Lighthouse, Galle' },
      { key: 'num_of_rooms', label: 'Rooms', type: 'number', def: () => '1' },
      { key: 'date_of_stay', label: 'Date of stay', type: 'date', def: () => isoDay(nextFriday()) },
      { key: 'activity_interested', label: 'Activity interested', type: 'text', def: () => 'Whale watching in Mirissa' },
    ],
  },
];

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nextFriday() {
  const d = new Date();
  d.setDate(d.getDate() + (((5 - d.getDay() + 7) % 7) || 7));
  return d;
}
const spokenDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const defaultsFor = (agent) => Object.fromEntries(agent.fields.map((f) => [f.key, f.blank ? '' : f.def()]));

// n8n base URL comes from .env (VITE_N8N_URL). Change it there and restart the app.
const N8N_URL = (import.meta.env.VITE_N8N_URL || '').replace(/\/+$/, '');
const SUMMARY_URL = import.meta.env.VITE_ELEVENLABS_SUMMARY_URL || (N8N_URL ? `${N8N_URL}/webhook/voice-summary` : '');
const label = (k) => String(k).replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());
const clock = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function VoiceAgents() {
  return (
    <ConversationProvider>
      <Desk />
    </ConversationProvider>
  );
}

function Desk() {
  const [activeId, setActiveId] = useState(null);
  const [runs, setRuns] = useState({});
  const [params, setParams] = useState(() => Object.fromEntries(AGENTS.map((a) => [a.id, defaultsFor(a)])));
  const activeRef = useRef(null);
  activeRef.current = activeId;

  const patch = (id, p) => setRuns((r) => ({ ...r, [id]: { ...r[id], ...(typeof p === 'function' ? p(r[id] || {}) : p) } }));

  const convo = useConversation({
    onConnect: ({ conversationId }) => activeRef.current && patch(activeRef.current, { conversationId, startedAt: new Date() }),
    onMessage: (m) => {
      const id = activeRef.current;
      if (!id || !m.message) return;
      const who = m.role === 'user' || m.source === 'user' ? 'user' : 'agent';
      patch(id, (r) => ({ lines: [...(r.lines || []), { who, text: m.message, at: new Date() }] }));
    },
    onDisconnect: (d) => {
      const id = activeRef.current;
      if (d && d.reason === 'error') console.error('ElevenLabs disconnected', d);
      if (id) {
        patch(id, (r) => ({ endedAt: new Date(), phase: 'done', error: r.error || (d?.reason === 'error' ? d.message || 'The call dropped.' : null) }));
        setActiveId(null);
      }
    },
    onError: (e, ctx) => {
      console.error('ElevenLabs error', e, ctx);
      const id = activeRef.current;
      if (id) patch(id, { error: typeof e === 'string' ? e : e?.message || 'The call dropped.' });
    },
  });

  const start = async (agent) => {
    if (activeId) return;
    setRuns((r) => ({ ...r, [agent.id]: { phase: 'live', lines: [], summary: null, summaryState: null } }));
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      patch(agent.id, { phase: 'idle', error: 'Allow microphone access to talk to the agent.' });
      return;
    }
    setActiveId(agent.id);
    activeRef.current = agent.id;
    try {
      await convo.startSession({
        agentId: agent.id,
        connectionType: 'websocket',
        dynamicVariables: Object.fromEntries(agent.fields.map((f) => {
          const raw = String(params[agent.id]?.[f.key] ?? '').trim() || f.def();
          return [f.key, f.type === 'date' ? spokenDate(raw) : raw];
        })),
      });
    } catch (e) {
      console.error('ElevenLabs startSession failed', e);
      patch(agent.id, { phase: 'idle', error: e?.message || 'Could not start the call.' });
      setActiveId(null);
    }
  };

  const stop = () => convo.endSession();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Voice Agents"
        purpose="Talk to our AI callers. Mandy qualifies leads, Sophie checks hotel availability. One call at a time."
      />
      <div className="flex flex-wrap gap-5">
        {AGENTS.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            run={runs[a.id] || { phase: 'idle' }}
            live={activeId === a.id}
            locked={!!activeId && activeId !== a.id}
            busyName={AGENTS.find((x) => x.id === activeId)?.name}
            convo={convo}
            values={params[a.id]}
            onValue={(k, v) => setParams((p) => ({ ...p, [a.id]: { ...p[a.id], [k]: v } }))}
            onStart={() => start(a)}
            onStop={stop}
            onSummary={(p) => patch(a.id, p)}
          />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, run, live, locked, busyName, convo, values, onValue, onStart, onStop, onSummary }) {
  const connecting = live && convo.status !== 'connected';
  const state = live ? (connecting ? 'connecting' : 'live') : run.phase === 'done' ? 'done' : 'idle';
  const lines = run.lines || [];
  const last = lines[lines.length - 1];

  useEffect(() => {
    if (state !== 'done' || !run.conversationId || run.summaryState || !SUMMARY_URL) return;
    let alive = true;
    onSummary({ summaryState: 'loading' });
    (async () => {
      for (let i = 0; i < 12 && alive; i++) {
        try {
          const res = await fetch(SUMMARY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation_id: run.conversationId }),
          });
          const data = res.ok ? await res.json() : null;
          if (data && (data.status === 'done' || data.data_collection)) {
            if (alive) onSummary({ summaryState: 'ready', summary: data });
            return;
          }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (alive) onSummary({ summaryState: 'failed' });
    })();
    return () => { alive = false; };
  }, [state, run.conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    const head = [
      `${agent.name} (${agent.title}) call transcript`,
      run.startedAt ? `Started ${run.startedAt.toLocaleString('en-GB')}` : '',
      run.conversationId ? `Conversation ID ${run.conversationId}` : '',
      '',
    ];
    const body = lines.map((l) => `[${clock(l.at)}] ${l.who === 'agent' ? agent.name : 'Caller'}: ${l.text}`);
    const blob = new Blob([[...head, ...body].join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${agent.name.toLowerCase()}-call-${(run.startedAt || new Date()).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const status = { idle: 'Ready', connecting: 'Connecting', live: convo.isSpeaking ? `${agent.name} is speaking` : 'Listening', done: 'Call ended' }[state];

  return (
    <section
      aria-label={`${agent.name}, ${agent.title}`}
      className={cx('flex min-w-0 flex-[1_1_380px] flex-col items-center gap-4 rounded-card border border-jw-border bg-white p-6 transition-opacity', locked && 'opacity-50')}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 font-head text-lg font-semibold tracking-tight text-jw-ink">{agent.name} <span className="font-medium text-jw-gray">· {agent.title}</span></h2>
          <p className="m-0 mt-1 text-[13px] text-jw-gray">{agent.blurb}</p>
        </div>
        <span className={cx('whitespace-nowrap px-2.5 py-1 text-xs font-semibold', state === 'live' ? 'bg-jw-olive-deep text-white' : 'bg-jw-offwhite text-jw-gray')}>{status}</span>
      </div>

      <Orb state={state} colors={agent.colors} convo={live ? convo : null} />

      <div aria-live="polite" className="min-h-[48px] max-w-[420px] text-center text-[14px] leading-normal text-jw-gray">
        {locked && `${busyName} is on a call. End it to talk to ${agent.name}.`}
        {!locked && state === 'idle' && (run.error || `Press call and talk to ${agent.name} through your microphone.`)}
        {state === 'connecting' && `Connecting you to ${agent.name}…`}
        {state === 'live' && (last ? <><b className="text-jw-ink">{last.who === 'agent' ? agent.name : 'You'}:</b> {last.text}</> : 'Say hello.')}
        {state === 'done' && (run.error ? `Call failed: ${run.error}` : `Call finished. ${lines.length} message${lines.length === 1 ? '' : 's'} recorded.`)}
      </div>

      {!live && (
        <fieldset disabled={locked} className="m-0 grid w-full grid-cols-2 gap-3 border-0 p-0">
          <legend className="sr-only">Call details for {agent.name}</legend>
          {agent.fields.map((f) => (
            <label key={f.key} className="flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase tracking-[.25px] text-jw-gray">
              {f.label}
              <input className={inputCls} type={f.type} min={f.type === 'number' ? 1 : undefined}
                value={values?.[f.key] ?? ''} placeholder={f.placeholder || f.def()}
                onChange={(e) => onValue(f.key, e.target.value)} />
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        {!live ? (
          <Button variant="primary" onClick={onStart} disabled={locked} className="min-w-[140px]">
            {state === 'done' ? 'Call again' : `Call ${agent.name}`}
          </Button>
        ) : (
          <>
            <RoundBtn label={convo.isMuted ? 'Unmute' : 'Mute'} onClick={() => convo.setMuted(!convo.isMuted)} on={convo.isMuted}>
              {convo.isMuted ? <MicOff /> : <Mic />}
            </RoundBtn>
            <RoundBtn label="End call" onClick={onStop} danger><X /></RoundBtn>
          </>
        )}
        {state === 'done' && lines.length > 0 && <Button onClick={download}>Download transcript</Button>}
      </div>

      {state === 'done' && <Summary run={run} />}

      {lines.length > 0 && (
        <details className="w-full border-t border-jw-line pt-3" open={state === 'live'}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[.25px] text-jw-gray">Transcript</summary>
          <ol className="m-0 mt-2 flex max-h-[220px] list-none flex-col gap-1.5 overflow-y-auto p-0 text-[13px]">
            {lines.map((l, i) => (
              <li key={i} className={l.who === 'agent' ? 'text-jw-ink' : 'text-jw-gray'}>
                <b>{l.who === 'agent' ? agent.name : 'You'}:</b> {l.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function Summary({ run }) {
  if (!SUMMARY_URL) return null;
  if (run.summaryState === 'loading') return <p className="m-0 text-[13px] text-jw-gray">Getting what the agent collected…</p>;
  if (run.summaryState === 'failed') return <p className="m-0 text-[13px] text-jw-gray">The summary isn't ready yet. The transcript has everything that was said.</p>;
  const s = run.summary;
  if (!s) return null;
  const fields = Object.entries(s.data_collection || {});
  return (
    <div className="flex w-full flex-col gap-2">
      {s.summary && <p className="m-0 bg-jw-pale px-3 py-2 text-[13px] text-jw-ink">{s.summary}</p>}
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {fields.map(([k, v]) => (
            <div key={k} className="bg-jw-offwhite px-3 py-2">
              <span className="block text-[11px] font-semibold uppercase tracking-[.25px] text-jw-gray">{label(k)}</span>
              <span className="text-[13px] font-semibold text-jw-ink">{v == null || v === '' ? 'Not given' : String(v?.value ?? v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Orb({ state, colors, convo }) {
  const orbRef = useRef(null);
  const barsRef = useRef(null);

  useEffect(() => {
    if (state !== 'live' || !convo) return;
    let raf;
    const tick = () => {
      const out = convo.getOutputVolume?.() || 0;
      const inp = convo.getInputVolume?.() || 0;
      const v = Math.min(1, Math.max(out, inp) * 1.6);
      if (orbRef.current) orbRef.current.style.transform = `scale(${(0.92 + v * 0.38).toFixed(3)})`;
      const freq = (out > inp ? convo.getOutputByteFrequencyData?.() : convo.getInputByteFrequencyData?.()) || [];
      const bars = barsRef.current?.children || [];
      for (let i = 0; i < bars.length; i++) {
        const f = freq.length ? freq[Math.floor((i / bars.length) * freq.length * 0.6)] / 255 : 0;
        bars[i].style.height = `${Math.round(4 + f * 26)}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (orbRef.current) orbRef.current.style.transform = '';
    };
  }, [state, convo]);

  const [c0, c1, c2] = colors;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex h-[200px] w-[200px] items-center justify-center">
        {state === 'connecting' && (
          <>
            <span className="jw-ring absolute inset-4 rounded-full border-2" style={{ borderColor: c1 }} />
            <span className="jw-ring absolute inset-4 rounded-full border-2" style={{ borderColor: c1, animationDelay: '.6s' }} />
          </>
        )}
        <div
          ref={orbRef}
          className={cx('h-[140px] w-[140px] rounded-full transition-[filter,transform] duration-500',
            state === 'idle' && 'jw-breathe', state === 'connecting' && 'jw-spin', state === 'done' && 'scale-[.6]')}
          style={{
            background: `radial-gradient(circle at 35% 30%, ${c0} 0%, ${c1} 45%, ${c2} 100%)`,
            filter: state === 'done' ? 'blur(2px)' : 'blur(12px)',
          }}
        />
        {state === 'done' && (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute h-8 w-8" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
        )}
      </div>
      <div ref={barsRef} aria-hidden="true" className={cx('flex h-[32px] items-center gap-1 transition-opacity', state === 'live' ? 'opacity-100' : 'opacity-0')}>
        {Array.from({ length: 17 }).map((_, i) => (
          <i key={i} className="block w-1 rounded-full" style={{ height: 4, background: c2 }} />
        ))}
      </div>
      <style>{`
        @keyframes jwBreathe { 50% { transform: scale(1.08); } }
        @keyframes jwSpin { to { transform: rotate(360deg) scale(1.02); } }
        @keyframes jwRing { 0% { transform: scale(.75); opacity: .8 } 100% { transform: scale(1.2); opacity: 0 } }
        .jw-breathe { animation: jwBreathe 4s ease-in-out infinite; }
        .jw-spin { animation: jwSpin 2.4s linear infinite; }
        .jw-ring { animation: jwRing 1.4s ease-out infinite; opacity: 0; }
        @media (prefers-reduced-motion: reduce) { .jw-breathe, .jw-spin, .jw-ring { animation: none; } }
      `}</style>
    </div>
  );
}

function RoundBtn({ label: l, onClick, children, danger, on }) {
  return (
    <button type="button" aria-label={l} title={l} onClick={onClick}
      className={cx('inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border',
        danger ? 'border-jw-magenta bg-jw-magenta text-white' : on ? 'border-jw-ink bg-jw-ink text-white' : 'border-jw-border bg-white text-jw-ink')}>
      {children}
    </button>
  );
}

const svg = { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const Mic = () => <svg {...svg}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const MicOff = () => <svg {...svg}><path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3" /></svg>;
const X = () => <svg {...svg}><path d="M6 6l12 12M18 6L6 18" /></svg>;
