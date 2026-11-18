import { createContext, useContext, useCallback, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { EnquiryHeader, Loading, ErrorState } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { getEnquiryHeader, setEnquiryStatus } from '../lib/api';
import Enquiry from './Enquiry';
import Quotes from './Quotes';
import FollowUps from './FollowUps';

const EnquiryContext = createContext(null);
export const useEnquiry = () => useContext(EnquiryContext);

const PANELS = { reply: 1, quote: 2, 'follow-up': 3 };

export default function EnquiryWorkspace() {
  const { id, panel } = useParams();
  const navigate = useNavigate();
  const header = useAsync(() => getEnquiryHeader(id), [id]);
  const [visited, setVisited] = useState({ reply: true });

  const active = panel || 'reply';
  if (panel && !PANELS[panel]) return <Navigate to={`/enquiries/${id}`} replace />;

  const step = PANELS[active] || 1;
  if (!visited[active]) setVisited((v) => ({ ...v, [active]: true }));

  const onStatusChange = useCallback(async (label) => {
    if (label === 'Closed') { navigate(`/enquiries/${id}/close`); return; }
    const prev = header.data;
    header.setData((d) => ({ ...d, status: label }));
    try { await setEnquiryStatus(id, label); header.reload(); }
    catch { header.setData(prev); }
  }, [id, header]);

  if (header.loading && !header.data) return <Loading what="Loading enquiry" />;
  if (header.error) return <ErrorState error={header.error} onRetry={header.reload} />;

  const ctx = { header: header.data, reloadHeader: header.reload, setHeader: header.setData };

  return (
    <EnquiryContext.Provider value={ctx}>
      <div className="flex flex-col gap-5">
        <EnquiryHeader e={header.data} step={step} onStatusChange={onStatusChange} />
        <div hidden={active !== 'reply'}>{visited.reply && <Enquiry enquiryId={id} embedded />}</div>
        <div hidden={active !== 'quote'}>{visited.quote && <Quotes enquiryId={id} embedded />}</div>
        <div hidden={active !== 'follow-up'}>{visited['follow-up'] && <FollowUps enquiryId={id} embedded />}</div>
      </div>
    </EnquiryContext.Provider>
  );
}
