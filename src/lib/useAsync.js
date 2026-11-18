import { useCallback, useEffect, useState } from 'react';

/** Runs an async loader. Returns { data, error, loading, reload, setData }. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try { setState({ data: await run(), error: null, loading: false }); }
    catch (error) { setState((s) => ({ ...s, error, loading: false })); }
  }, [run]);
  useEffect(() => { reload(); }, [reload]);
  const setData = (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  return { ...state, reload, setData };
}
