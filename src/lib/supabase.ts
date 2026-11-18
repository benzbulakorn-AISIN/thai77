import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// PKCE: e-mail links come back as ?code=... (not #access_token) so they do not clash with HashRouter
export const supabase = createClient(
  env.supabaseUrl || 'https://invalid.localhost',
  env.supabaseAnonKey || 'missing-key',
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
