import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, EnquiryHeader, Card, Badge, Button, Field, Combobox, Segmented, SentNotice, inputCls, textareaCls, cx } from '../components/ui.jsx';
import { findEnquiry, getEnquiryHeader, quotePrefill, sendQuote, subscribeOutbox, latestQuoteOutbox, searchCustomers, createManualEnquiry, listQuotesForContact } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const EMPTY = {
  person: '', company: '', address: '', ref: '', date: today(), title: '',
  lines: [{ desc: '', amt: '' }], bank: '0', currency: 'USD',
  benef: 'Jetwing Travels (Private) Ltd', bankname: 'Commercial Bank of Ceylon PLC', acct: '', note: '',
  emailSubject: '', emailBody: '',
};
const CURRENCIES = ['USD', 'LKR'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const num = (x) => parseFloat(String(x).replace(/[^0-9.]/g, '')) || 0;
const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const words = (n) => {
  if (n === 0) return '';
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + words(n % 100) : '');
  if (n < 1000000) return words(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + words(n % 1000) : '');
  return String(n);
};

function Step({ n, title, children }) {
  return (
    <div className="flex flex-col gap-3.5">
      <span className="flex items-center gap-2.5 font-head text-[15px] font-semibold text-jw-ink">
        <span className="inline-flex h-6 w-6 items-center justify-center bg-jw-olive-deep text-[13px] text-white">{n}</span>{title}
      </span>
      {children}
    </div>
  );
}

export default function Quotes({ enquiryId: propEnquiryId, embedded } = {}) {
  const [params, setParams] = useSearchParams();
  const enquiryId = propEnquiryId || params.get('enquiry') || '';
  const [who, setWho] = useState(null); // { id, name, email, subject } of the enquiry this quote is for
  const [findErr, setFindErr] = useState('');
  const [creating, setCreating] = useState(false);
  const contactEmail = who?.email || '';
  const history = useAsync(() => contactEmail ? listQuotesForContact(contactEmail) : Promise.resolve([]), [contactEmail]);
  const [v, setV] = useState(EMPTY);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Newest quote for this enquiry: { id, status, last_error, version }. Loaded on open, replaced when we send.
  const [out, setOut] = useState(null);
  const inFlight = out?.status === 'queued' || out?.status === 'processing';

  // Flip "Queued" to "Sent" or "Failed" when n8n finishes, without a refresh.
  const outId = out?.id;
  useEffect(() => {
    if (!outId || !enquiryId) return undefined;
    return subscribeOutbox(enquiryId, (p) => { if (p.new?.id === outId) setOut((o) => ({ ...o, ...p.new })); });
  }, [outId, enquiryId]);

  useEffect(() => {
    if (!enquiryId) { setWho(null); return; }
    setWho(null);
    setOut(null);
    let live = true;
    setErr('');
    latestQuoteOutbox(enquiryId).then((o) => live && setOut(o)).catch((e) => live && setErr(e.message));
    getEnquiryHeader(enquiryId).then((h) => live && setWho(h)).catch((e) => live && setErr(e.message));
    quotePrefill(enquiryId).then((p) => {
      if (!live) return;
      setV((s) => ({ ...s, person: p.person, company: p.company, address: p.address, title: p.title }));
      setSent(false);
    }).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [enquiryId]);

  const set = (k) => (e) => { setV((s) => ({ ...s, [k]: e.target.value })); setSent(false); };
  const setLines = (fn) => { setV((s) => ({ ...s, lines: fn(s.lines) })); setSent(false); };
  const updLine = (i, k) => (e) => { const val = e.target.value; setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: val } : l))); };

  const cur = v.currency === 'LKR' ? 'LKR' : 'US$';
  const total = v.lines.reduce((a, l) => a + num(l.amt), 0) + num(v.bank);
  const whole = Math.floor(total);
  const cents = Math.round((total - whole) * 100);
  const inWords = (words(whole) || 'Zero') + (cents ? ' And ' + cents + '/100' : '');
  const toEmail = who?.email || '';
  const first = who?.name.split(' ')[0];

  const pickCustomer = (item) => {
    setFindErr('');
    if (item.enquiryId) { setParams({ enquiry: item.enquiryId }); }
    else {
      setCreating(true); setFindErr('');
      createManualEnquiry(item.email, item.name, '').then((id) => { setParams({ enquiry: id }); }).catch((e) => setFindErr(e.message)).finally(() => setCreating(false));
    }
  };
  const pickNewEmail = async (email) => {
    setCreating(true); setFindErr('');
    try { const id = await createManualEnquiry(email, '', ''); setParams({ enquiry: id }); }
    catch (e) { setFindErr(e.message); }
    setCreating(false);
  };
  const change = () => { setParams({}); setV(EMPTY); setSent(false); };

  const send = async () => {
    setErr('');
    if (!enquiryId) return setErr('First find the customer this quote is for.');
    if (!EMAIL.test(toEmail)) return setErr('This customer has no valid email address on file.');
    if (!v.lines.some((l) => l.desc.trim())) return setErr('Add at least one item.');
    // Never two quotes on the way at once.
    if (inFlight) return setErr(`A quote is already on its way to ${first || 'this customer'}. Wait until it shows Sent, then send a revised one if needed.`);
    // A quote already went out: sending again emails the customer a second one, so ask first.
    if (out?.status === 'sent') {
      const next = out.version ? ` (version ${out.version + 1})` : '';
      if (!window.confirm(`${first || 'This customer'} already has a quote${out.version ? ` (version ${out.version})` : ''}.\n\nSend a revised quote${next}? They will get a second email.`)) return;
    }
    setBusy(true);
    try { const q = await sendQuote(enquiryId, v, toEmail); setOut(q.outbox); setSent(true); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-5">
      {embedded ? null : who ? (
        <EnquiryHeader e={who} step={2} done={sent} />
      ) : (
        <PageHeader title="Send a quote"
          purpose="Type the customer's email or enquiry ID to start. Their details fill in for you." />
      )}

      <div className="flex flex-wrap items-start gap-4">
        <Card title={who ? `${first}'s Quote` : 'Quote Form'} className="flex-[1_1_520px]">
          <div className="flex flex-col gap-7 px-5 py-4">
            <Step n={1} title="Customer">
              {who ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border border-jw-olive-deep bg-jw-pale px-3.5 py-2.5 text-jw-ink">
                  <span><b>{who.name}</b> &nbsp;{who.email}<br /><span className="text-[13px] text-jw-gray">Enquiry: {who.subject || '(no subject)'}</span></span>
                  {!sent && <button type="button" onClick={change} className="min-h-[44px] px-2 font-semibold text-jw-olive-deep">Change</button>}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Field label="Search by name or email">
                    <Combobox placeholder="Type a name or email…" autoFocus
                      onSearch={searchCustomers}
                      renderItem={(c) => (
                        <span>
                          <b className="text-jw-ink">{c.name || c.email}</b>{c.name && <span className="ml-1.5 text-jw-gray">{c.email}</span>}
                          {c.subject && <span className="block text-xs text-jw-gray">{c.subject}</span>}
                        </span>
                      )}
                      onSelect={pickCustomer}
                      onFreeEntry={pickNewEmail}
                      freeEntryLabel={(email) => `Send to new customer ${email}`}
                    />
                  </Field>
                  {creating && <span className="text-xs text-jw-gray">Creating enquiry…</span>}
                  {findErr && <div role="alert" className="border-l-4 border-jw-ink bg-jw-offwhite px-3 py-2 text-jw-ink">{findErr}</div>}
                </div>
              )}
              <Field label="Name"><input className={inputCls} value={v.person} onChange={set('person')} /></Field>
              <Field label="Company"><input className={inputCls} value={v.company} onChange={set('company')} /></Field>
              <Field label="Address or email"><input className={inputCls} value={v.address} onChange={set('address')} /></Field>
            </Step>

            <Step n={2} title="Quote details">
              <div className="flex flex-wrap items-end gap-3.5">
                <Field label="Quote no" className="flex-[1_1_180px]"><input className={inputCls} value={v.ref} placeholder="Made for you if empty" onChange={set('ref')} /></Field>
                <Field label="Date" className="flex-[1_1_180px]"><input className={inputCls} value={v.date} onChange={set('date')} /></Field>
                <Field label="Currency"><Segmented options={CURRENCIES} value={v.currency} onChange={(c) => { setV((s) => ({ ...s, currency: c })); setSent(false); }} /></Field>
              </div>
              <Field label="Heading"><textarea className={cx(textareaCls, 'min-h-[72px]')} value={v.title} onChange={set('title')} /></Field>
            </Step>

            <Step n={3} title="Items">
              {v.lines.map((l, i) => (
                <div key={i} className="flex items-end gap-2.5">
                  <Field label="Item" className="min-w-0 flex-auto"><input className={inputCls} value={l.desc} placeholder="Hotel, nights, transfer…" onChange={updLine(i, 'desc')} /></Field>
                  <Field label={`Amount ${cur}`} className="flex-[0_0_130px]"><input className={inputCls} value={l.amt} onChange={updLine(i, 'amt')} /></Field>
                  <Button aria-label={`Remove item ${i + 1}`} className="px-3.5" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</Button>
                </div>
              ))}
              <Button className="self-start" onClick={() => setLines((ls) => [...ls, { desc: '', amt: '' }])}>Add Item</Button>
              <Field label={`Bank charges ${cur}`} className="max-w-[200px]"><input className={inputCls} value={v.bank} onChange={set('bank')} /></Field>
            </Step>

            <Step n={4} title="Payment details">
              <Field label="Beneficiary"><input className={inputCls} value={v.benef} onChange={set('benef')} /></Field>
              <div className="flex flex-wrap gap-3.5">
                <Field label="Bank" className="flex-[1_1_240px]"><input className={inputCls} value={v.bankname} onChange={set('bankname')} /></Field>
                <Field label="Account no" className="flex-[1_1_200px]"><input className={inputCls} value={v.acct} placeholder="Add account number" onChange={set('acct')} /></Field>
              </div>
              <Field label="Note to customer, optional"><textarea className={cx(textareaCls, 'min-h-[72px]')} value={v.note} onChange={set('note')} /></Field>
            </Step>

            <Step n={5} title="Email & Send">
              <Field label="Email subject"><input className={inputCls} value={v.emailSubject} placeholder={`Your quotation ${v.ref || '(number)'}`} onChange={set('emailSubject')} /></Field>
              <Field label="Email message (optional)"><textarea className={cx(textareaCls, 'min-h-[72px]')} value={v.emailBody} placeholder={`Dear ${first || 'customer'}, please find your quotation attached…`} onChange={set('emailBody')} /></Field>
              <span className="text-jw-ink">{who ? <>Goes to <b>{toEmail || 'no email on file'}</b></> : 'Find the customer in part 1 first.'}</span>
              {err && <div role="alert" className="border-l-4 border-jw-ink bg-jw-offwhite px-3 py-2 text-jw-ink">{err}</div>}
              <div className="mt-1 flex flex-wrap gap-2">
                <Button variant="primary" disabled={busy || sent || inFlight} className="disabled:opacity-60" onClick={send}>{busy ? 'Saving…' : 'Send Quote'}</Button>
                <Button to={enquiryId ? `/enquiries/${enquiryId}` : '/enquiries'}>Cancel</Button>
              </div>
              {!sent && inFlight && (
                <SentNotice><b>A quote is already on its way to {first || 'this customer'}{out.version ? ` (version ${out.version})` : ''}.</b> You can send a revised one after it shows Sent. This updates by itself.</SentNotice>
              )}
              {sent && out?.status === 'failed' ? (
                <div role="alert" className="bg-red-50 px-3.5 py-3 text-red-800">
                  <b>The quote was not sent.</b> {out.last_error || 'Unknown error.'} Fix it, then press Send Quote again.
                </div>
              ) : sent && out?.status === 'sent' ? (
                <SentNotice><b>Quote sent to {toEmail}.</b> A follow-up is set.
                  {enquiryId && <> <Link to={`/enquiries/${enquiryId}/follow-up`} className="font-semibold text-jw-olive-deep">See {first}'s follow-up &rarr;</Link></>}</SentNotice>
              ) : sent && (
                <SentNotice>{out?.status === 'processing' ? <>Making the PDF and sending to <b>{toEmail}</b>…</> : <>Quote saved and queued for <b>{toEmail}</b>.</>} It usually goes out within 1–2 minutes. This updates by itself.</SentNotice>
              )}
            </Step>
          </div>
        </Card>

        <Card title={who ? `What ${first} Gets` : 'What The Customer Gets'} subtitle="Updates as you fill the form" right={<Badge tone="line">PDF</Badge>} className="flex-[1_1_520px]">
          <div className="flex flex-col gap-[18px] bg-white p-7 text-jw-ink">
            <div className="text-center">
              <div className="font-head text-[26px] font-bold tracking-tight text-jw-olive-deep">Jetwing Travels</div>
              <div className="text-xs text-jw-gray">Sri Lanka &nbsp;|&nbsp; Jetwing House, 46/26 Navam Mawatha, Colombo 2</div>
            </div>
            <div className="border-t border-jw-border pt-3.5 text-center font-semibold tracking-[.5px]">QUOTATION</div>
            <div className="leading-normal"><b>{v.person}</b><br />{v.company}<br /><span className="text-jw-gray">{v.address}</span></div>
            <div className="leading-normal">Quote no: <b>{v.ref || '(made on send)'}</b><br />{v.date}</div>
            <div className="border border-jw-ink">
              <div className="flex justify-between gap-4 border-b border-jw-ink px-3 py-2">
                <span className="font-semibold">{v.person}</span><span className="text-xs">Amount, {cur}</span>
              </div>
              <div className="p-3 font-semibold">{v.title}</div>
              {v.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-4 px-3 py-1">
                  <span>{l.desc}</span><span className="tabular-nums">{fmt(num(l.amt))}</span>
                </div>
              ))}
              <div className="px-3 pb-3.5 pt-1">Bank charges = {cur} {fmt(num(v.bank))}</div>
              <div className="flex justify-between border-t border-jw-ink px-3 py-2">
                <span>Grand Total</span><span className="font-semibold tabular-nums">{fmt(total)}</span>
              </div>
              <div className="border-t border-jw-ink px-3 py-2 font-semibold">{cur} {inWords} Only</div>
            </div>
            <div className="text-[13px] leading-relaxed">
              <b>Beneficiary:</b> {v.benef}<br /><b>Bank:</b> {v.bankname}<br /><b>Account no:</b> {v.acct || 'to be added'}
            </div>
            {v.note.trim() !== '' && <div className="text-[13px] text-jw-gray">{v.note}</div>}
          </div>
        </Card>

        {who && history.data?.length > 0 && (
          <Card title={`Quotes sent to ${first}`} subtitle={`${history.data.length} quote${history.data.length === 1 ? '' : 's'}`} className="flex-[1_1_520px]">
            <div className="flex flex-col divide-y divide-jw-line">
              {history.data.map((q) => (
                <div key={q.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <span className="font-semibold text-jw-ink">{q.number}{q.version > 1 ? ` v${q.version}` : ''}</span>
                    <span className="ml-2 text-xs text-jw-gray">{q.subject}</span>
                    <span className="block text-xs text-jw-gray">{new Date(q.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-jw-ink">{q.currency === 'LKR' ? 'LKR' : 'US$'} {q.total != null ? fmt(q.total) : '—'}</span>
                    {q.pdfPath ? (
                      <Badge tone="pale">PDF</Badge>
                    ) : (
                      <Badge tone="line">{q.status === 'sent' ? 'Sent' : q.status}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
