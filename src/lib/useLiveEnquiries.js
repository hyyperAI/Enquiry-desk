import { useEffect, useRef, useState } from 'react';
import { subscribeEnquiries } from './api';

/**
 * Calls onChange shortly after any enquiry is added or changed, by anyone (staff or n8n).
 * Several changes close together (n8n adds a row, then fills in the summary) become one call.
 * onChange gets the ids of enquiries that were newly added. Returns true while connected.
 */
export function useLiveEnquiries(onChange) {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    let timer;
    let added = [];
    const off = subscribeEnquiries((p) => {
      if (p.eventType === 'INSERT' && p.new?.id) added.push(p.new.id);
      clearTimeout(timer);
      timer = setTimeout(() => { const ids = added; added = []; cb.current(ids); }, 400);
    }, setConnected);
    return () => { clearTimeout(timer); off(); };
  }, []);
  return connected;
}
