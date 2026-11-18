import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

const AuthCtx = createContext({ session: null, user: null, loading: true });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return <AuthCtx.Provider value={{ session, user: session?.user ?? null, loading }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const signOut = () => supabase.auth.signOut();

/** Re-checks the current password, then sets the new one. */
export async function changePassword(email, current, next) {
  const check = await supabase.auth.signInWithPassword({ email, password: current });
  if (check.error) return { error: new Error('Current password is wrong.') };
  return supabase.auth.updateUser({ password: next });
}
