// Supabase Edge Function: delete-account
// Deletes the CALLER's own account: storage files -> auth user (DB rows cascade via ON DELETE CASCADE).
// The service role key is read from the function's environment (never sent to the browser).
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin) ? origin || '*' : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

async function listFiles(admin: ReturnType<typeof createClient>, bucket: string, prefix: string, depth = 1): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data) return out;
    for (const it of data) {
      const p = `${prefix}/${it.name}`;
      if (!it.id) { if (depth < 3) out.push(...(await listFiles(admin, bucket, p, depth + 1))); } else out.push(p);
    }
    if (data.length < 1000) return out;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'method not allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json(req, 500, { error: 'server not configured' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(req, 401, { error: 'unauthorized' });

  // who is calling? (validated by Supabase Auth)
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json(req, 401, { error: 'unauthorized' });

  let body: { confirm?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (body.confirm !== 'DELETE') return json(req, 400, { error: 'confirmation required' });

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // 1) storage files in the user's own folders
  for (const bucket of ['memory-photos', 'trip-covers']) {
    const files = await listFiles(admin, bucket, user.id);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(files.slice(i, i + 100));
      if (error) return json(req, 500, { error: 'storage cleanup failed' });
    }
  }

  // 2) auth user -> profiles, settings, trips, visits ... cascade
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json(req, 500, { error: 'delete failed' });

  console.log('account deleted'); // no personal data in logs
  return json(req, 200, { ok: true });
});
