import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { ColorMode, ThemeId } from './themes';

type Ctx = { theme: ThemeId; mode: ColorMode; setTheme: (t: ThemeId) => void; setMode: (m: ColorMode) => void };
const ThemeCtx = createContext<Ctx | null>(null);
const KEY = 'thai77.theme';

function readLocal(): { theme: ThemeId; mode: ColorMode } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { theme: v.theme ?? 'ocean', mode: v.mode ?? 'system' };
  } catch {
    return { theme: 'ocean', mode: 'system' };
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [{ theme, mode }, setState] = useState(readLocal);

  // load saved theme from cloud after login
  useEffect(() => {
    if (!user) return;
    supabase.from('user_settings').select('theme,color_mode').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setState({ theme: data.theme as ThemeId, mode: data.color_mode as ColorMode });
      });
  }, [user]);

  // apply to <html>
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && mq.matches);
      root.dataset.theme = theme;
      root.classList.toggle('dark', dark);
    };
    apply();
    localStorage.setItem(KEY, JSON.stringify({ theme, mode }));
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, mode]);

  const persist = (next: { theme: ThemeId; mode: ColorMode }) => {
    setState(next);
    if (user) {
      supabase.from('user_settings').update({ theme: next.theme, color_mode: next.mode })
        .eq('user_id', user.id).then(() => undefined);
    }
  };

  return (
    <ThemeCtx.Provider value={{
      theme, mode,
      setTheme: (t) => persist({ theme: t, mode }),
      setMode: (m) => persist({ theme, mode: m }),
    }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error('useTheme must be inside ThemeProvider');
  return c;
}
