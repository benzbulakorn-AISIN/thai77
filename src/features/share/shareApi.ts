import { supabase } from '../../lib/supabase';
import { parseSharedTrip, type ParseResult } from './sharedTripModel';
import { shareErrorText, type ShareParams, type ShareRow } from './shareModel';

const COLS = 'id,trip_id,token,display_name,sharer_name,message,show_dates,show_lodging_names,show_custom_titles,expires_at,revoked_at,created_at';

function fail(error: unknown): never {
  console.error('[thai77] share failed', (error as { code?: string })?.code, (error as { message?: string })?.message);
  throw new Error(shareErrorText(error));
}

/** my links of one trip (the database lets only the trip owner read them) */
export async function listShares(tripId: string): Promise<ShareRow[]> {
  const { data, error } = await supabase.from('trip_shares').select(COLS).eq('trip_id', tripId).order('created_at', { ascending: false }).limit(50);
  if (error) fail(error);
  return (data ?? []) as unknown as ShareRow[];
}

/** owner only. The token is chosen by the database. */
export async function createShare(p: ShareParams): Promise<ShareRow> {
  const { data, error } = await supabase.rpc('create_trip_share', p);
  if (error) fail(error);
  // a function that returns one row may come back as an object or as a one-item list: accept both
  const row = (Array.isArray(data) ? data[0] : data) as ShareRow | null | undefined;
  if (!row || typeof row.token !== 'string' || typeof row.id !== 'string') fail({ message: 'empty' });
  return row;
}

export async function revokeShare(shareId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_trip_share', { p_share: shareId });
  if (error) fail(error);
}

/** what a viewer WOULD see with these options (nothing is created) */
export async function previewShare(p: ShareParams): Promise<ParseResult> {
  const { data, error } = await supabase.rpc('preview_trip_share', p);
  if (error) fail(error);
  return parseSharedTrip(data);
}

export type ViewerResult = ParseResult | { ok: false; reason: 'error' };

/** anyone (no sign-in). null from the server = not found / expired / revoked (deliberately indistinguishable) */
export async function fetchSharedTrip(token: string): Promise<ViewerResult> {
  try {
    const { data, error } = await supabase.rpc('get_shared_trip', { p_token: token });
    if (error) {
      console.error('[thai77] shared trip failed', (error as { code?: string }).code);
      return { ok: false, reason: 'error' };
    }
    return parseSharedTrip(data);
  } catch {
    return { ok: false, reason: 'error' };
  }
}
