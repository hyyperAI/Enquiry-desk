import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Enquiries from './pages/Enquiries.jsx';
import EnquiryWorkspace from './pages/EnquiryWorkspace.jsx';
import CloseEnquiry from './pages/CloseEnquiry.jsx';
import Chats from './pages/Chats.jsx';
import Quotes from './pages/Quotes.jsx';
import FollowUps from './pages/FollowUps.jsx';
import AIAgent from './pages/AIAgent.jsx';
import VoiceAgents from './pages/VoiceAgents.jsx';
import Settings from './pages/Settings.jsx';
import Templates from './pages/Templates.jsx';

function QuotesRedirect() {
  const [params] = useSearchParams();
  const eid = params.get('enquiry');
  if (eid) return <Navigate to={`/enquiries/${eid}/quote`} replace />;
  return <Quotes />;
}

function FollowUpsRedirect() {
  const [params] = useSearchParams();
  const eid = params.get('enquiry');
  if (eid) return <Navigate to={`/enquiries/${eid}/follow-up`} replace />;
  return <FollowUps />;
}

export default function App() {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-8">Loading…</div>;
  if (!session) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/enquiries" element={<Enquiries />} />
        <Route path="/enquiries/:id" element={<EnquiryWorkspace />} />
        <Route path="/enquiries/:id/close" element={<CloseEnquiry />} />
        <Route path="/enquiries/:id/:panel" element={<EnquiryWorkspace />} />
        <Route path="/chats" element={<Chats />} />
        <Route path="/quotes" element={<QuotesRedirect />} />
        <Route path="/follow-ups" element={<FollowUpsRedirect />} />
        <Route path="/ai-agent" element={<AIAgent />} />
        <Route path="/voice-agents" element={<VoiceAgents />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
