import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';

type Profile = { id: string; display_name: string | null; role: 'user' | 'admin' };
type Ctx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(env.isConfigured);

  useEffect(() => {
    if (!env.isConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // remove ?code=... left by the e-mail link
      if (window.location.search.includes('code=')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      if (event === 'PASSWORD_RECOVERY') window.location.hash = '#/auth/reset';
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) { setProfile(null); return; }
    supabase.from('profiles').select('id,display_name,role').eq('id', userId).maybeSingle()
      .then(({ data }) => setProfile((data as Profile | null) ?? null));
  }, [userId]);

  const value: Ctx = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === 'admin',
    loading,
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth must be inside AuthProvider');
  return c;
}
