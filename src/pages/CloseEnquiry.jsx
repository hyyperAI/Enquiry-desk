import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, textareaCls, cx, Loading, ErrorState } from '../components/ui';
import { getEnquiryHeader, closeEnquiry, CLOSE_REASONS } from '../lib/api';
import { useAsync } from '../lib/useAsync';

export default function CloseEnquiry() {
  const { id } = useParams();
  const { data: h, error: loadError, loading, reload } = useAsync(() => getEnquiryHeader(id), [id]);
  const [reason, setReason] = useState(CLOSE_REASONS[0].value);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const submit = async () => {
    setSaving(true); setError(null);
    try { await closeEnquiry(id, reason, note.trim()); navigate('/enquiries'); }
    catch (e) { setError(e); setSaving(false); }
  };

  return (
    <div className="-m-8 flex min-h-[calc(100vh)] flex-1 items-center justify-center bg-[rgba(26,26,26,0.45)] p-8">
      <section role="dialog" aria-modal="true" aria-labelledby="ct" className="w-full max-w-[520px] rounded-card border border-jw-border bg-white">
        <div className="flex flex-col gap-1 border-b border-jw-border px-6 py-5">
          <h1 id="ct" className="m-0 font-head text-[22px] font-bold tracking-tight text-jw-ink">Close This Enquiry</h1>
          {loadError ? <ErrorState error={loadError} onRetry={reload} />
            : loading && !h ? <Loading what="Loading enquiry" />
            : <span>Last step. {h.name}{h.subject ? `, ${h.subject}` : ''}. Pick why it ended, then press Close Enquiry.</span>}
        </div>
        <div className="flex flex-col gap-2.5 px-6 py-5">
          <span id="reason-l" className="text-xs font-semibold uppercase tracking-[.25px]">Reason</span>
          <div role="radiogroup" aria-labelledby="reason-l" className="flex flex-col gap-2">
            {CLOSE_REASONS.map((r) => (
              <label key={r.value} className={cx('flex min-h-[48px] cursor-pointer items-center gap-3 border px-3.5 text-jw-ink',
                reason === r.value ? 'border-jw-olive-deep bg-jw-pale' : 'border-jw-border')}>
                <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="h-5 w-5 accent-jw-olive-deep" />
                {r.label}
              </label>
            ))}
          </div>
          <label className="mt-1.5 flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[.25px]">
            Note, optional
            <textarea className={cx(textareaCls, 'min-h-[88px] font-normal normal-case tracking-normal')} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <span className="text-[13px]">Closing also cancels any scheduled follow-up. The reason is saved with the enquiry.</span>
          {error && <span role="alert" className="font-semibold text-jw-ink">Could not close it: {error.message || String(error)}</span>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-jw-border px-6 py-4">
          <Button to={`/enquiries/${id}`}>Cancel</Button>
          <Button variant="dark" onClick={submit} disabled={saving || !!loadError} className="disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Closing…' : 'Close Enquiry'}</Button>
        </div>
      </section>
    </div>
  );
}
