import { useEffect, useRef, useState } from 'react';
import { PageHeader, NextBanner, Card, Badge, Button, Chip, Toggle, Field, Loading, ErrorState, Empty, inputCls, textareaCls, cx } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import {
  TEMPLATE_CATEGORIES, TEMPLATE_VARIABLES, templateCategoryLabel, templateVars,
  listTemplates, saveTemplate, deleteTemplate, setTemplateActive,
} from '../lib/api';

const BLANK = { id: null, name: '', category: 'initial_response', subject: '', body: '', is_active: true };
const Alert = ({ children }) => <div role="alert" className="border-l-4 border-jw-ink bg-jw-offwhite px-3 py-2 text-jw-ink">{children}</div>;

export default function Templates() {
  const list = useAsync(() => listTemplates(), []);
  const [cat, setCat] = useState('all');
  const [t, setT] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [msg, setMsg] = useState(null); // { ok } | { err }
  const bodyRef = useRef(null);
  const [focusField, setFocusField] = useState('body');
  const subjectRef = useRef(null);

  useEffect(() => { setConfirmDel(false); setMsg(null); }, [t.id]);

  const rows = list.data || [];
  const shown = cat === 'all' ? rows : rows.filter((r) => r.category === cat);
  const count = (v) => rows.filter((r) => r.category === v).length;
  const set = (k) => (e) => setT((s) => ({ ...s, [k]: e.target.value }));
  const used = templateVars(t.subject, t.body);

  // Insert {{variable}} at the cursor of the subject or body, whichever was used last.
  const insertVar = (v) => {
    const key = focusField === 'subject' ? 'subject' : 'body';
    const el = key === 'subject' ? subjectRef.current : bodyRef.current;
    const tag = `{{${v}}}`;
    const val = t[key];
    const start = el?.selectionStart ?? val.length, end = el?.selectionEnd ?? val.length;
    setT((s) => ({ ...s, [key]: val.slice(0, start) + tag + val.slice(end) }));
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = start + tag.length; } });
  };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const saved = await saveTemplate(t);
      list.setData((ls) => (t.id ? ls.map((x) => (x.id === saved.id ? saved : x)) : [...(ls || []), saved]));
      setT(saved); setMsg({ ok: 'Saved.' });
    } catch (e) { setMsg({ err: e.message }); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true); setMsg(null);
    try { await deleteTemplate(t.id); list.setData((ls) => ls.filter((x) => x.id !== t.id)); setT(BLANK); }
    catch (e) { setMsg({ err: e.message }); }
    setBusy(false);
  };
  const toggle = async (r, on) => {
    list.setData((ls) => ls.map((x) => (x.id === r.id ? { ...x, is_active: on } : x)));
    if (t.id === r.id) setT((s) => ({ ...s, is_active: on }));
    try { await setTemplateActive(r.id, on); }
    catch (e) { setMsg({ err: e.message }); list.reload(); }
  };

  return (
    <>
      <PageHeader title="Templates" purpose="Ready-made emails for replies and follow-ups. Write once, reuse with the customer's details filled in." />
      <NextBanner label="What to do now" text={rows.length
        ? 'Pick a template on the left to edit it, or press New Template. Only active templates are offered when replying.'
        : 'No templates yet. Press New Template and write your first one, for example the initial enquiry response.'}
        action={<Button variant="primary" onClick={() => setT(BLANK)}>New Template</Button>} />

      <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
        <Chip on={cat === 'all'} count={rows.length} onClick={() => setCat('all')}>All</Chip>
        {TEMPLATE_CATEGORIES.map((c) => (
          <Chip key={c.value} on={cat === c.value} count={count(c.value)} onClick={() => setCat(c.value)}>{c.label}</Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="flex-[1_1_380px]" title="Your Templates" right={<Badge tone="line">{shown.length}</Badge>}>
          {list.loading && !list.data ? <Loading what="Loading templates" />
            : list.error ? <div className="p-4"><ErrorState error={list.error} onRetry={list.reload} /></div>
            : shown.length === 0 ? <Empty>{rows.length ? 'No templates in this category yet.' : 'No templates yet.'}</Empty>
            : (
              <ul className="m-0 list-none p-0">
                {shown.map((r) => (
                  <li key={r.id} className={cx('flex min-h-[64px] items-center gap-3 border-b border-jw-line px-5 py-2 last:border-b-0',
                    t.id === r.id && 'bg-jw-pale shadow-[inset_3px_0_0_#737101]')}>
                    <button type="button" onClick={() => setT(r)} className="min-h-[44px] min-w-0 flex-1 text-left">
                      <span className="block truncate font-semibold text-jw-ink">{r.name}</span>
                      <span className="block truncate text-[13px]">{templateCategoryLabel(r.category)} &middot; {r.subject || '(no subject)'}</span>
                    </button>
                    <Toggle checked={r.is_active} label={`${r.name} active`} onChange={(on) => toggle(r, on)} />
                  </li>
                ))}
              </ul>
            )}
        </Card>

        <Card accent className="flex-[2_1_480px]" title={t.id ? `Edit: ${t.name || 'Template'}` : 'New Template'}
          right={<Badge tone={t.is_active ? 'pale' : 'line'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>}>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <div className="flex flex-wrap gap-3.5">
              <Field label="Template name" className="flex-[1_1_220px]"><input className={inputCls} value={t.name} placeholder="Kandy hotel first reply" onChange={set('name')} /></Field>
              <Field label="Category" className="flex-[1_1_220px]">
                <select className={inputCls} value={t.category} onChange={set('category')}>
                  {TEMPLATE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Subject">
              <input ref={subjectRef} className={inputCls} value={t.subject} placeholder="Your trip to {{destination}}" onChange={set('subject')} onFocus={() => setFocusField('subject')} />
            </Field>
            <Field label="Email body">
              <textarea ref={bodyRef} className={cx(textareaCls, 'min-h-[240px]')} value={t.body} onChange={set('body')} onFocus={() => setFocusField('body')}
                placeholder={'Hi {{customer_name}},\n\nThank you for your enquiry about {{service}}...\n\n{{agent_name}}\nJetwing Travels'} />
            </Field>
            <div>
              <span className="text-xs font-semibold uppercase tracking-[.25px]">Insert a variable</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button key={v} type="button" onClick={() => insertVar(v)}
                    className={cx('inline-flex min-h-[40px] items-center border px-3 text-[13px] font-semibold',
                      used.includes(v) ? 'border-jw-olive-deep bg-jw-pale text-jw-olive-deep' : 'border-jw-border bg-white text-jw-gray hover:border-jw-olive-deep')}>
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              <span className="mt-2 block text-[13px]">
                {used.length ? <>Uses: {used.map((v) => <b key={v} className="text-jw-ink">{v} </b>)}</> : 'No variables used yet. They are filled with the customer\'s details when used.'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-jw-line pt-3">
              <span id="tpl-active"><span className="font-semibold text-jw-ink">Active</span><br /><span className="text-[13px]">Inactive templates are kept but not offered.</span></span>
              <Toggle checked={t.is_active} labelledBy="tpl-active" onChange={(on) => setT((s) => ({ ...s, is_active: on }))} />
            </div>
            {msg?.err && <Alert>{msg.err}</Alert>}
            {confirmDel ? (
              <div className="flex flex-col gap-2 bg-jw-offwhite px-3.5 py-3 text-jw-ink">
                <span>Delete "{t.name}"? This cannot be undone.</span>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Yes, Delete'}</Button>
                  <Button disabled={busy} onClick={() => setConfirmDel(false)}>Keep It</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={busy || !t.name.trim()} className="min-w-[140px] disabled:opacity-60" onClick={save}>{busy ? 'Saving…' : 'Save Template'}</Button>
                {t.id && <Button disabled={busy} onClick={() => setConfirmDel(true)}>Delete</Button>}
                {msg?.ok && <span role="status" className="text-[13px]">{msg.ok}</span>}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
