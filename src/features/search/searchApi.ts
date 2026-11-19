import { supabase } from '../../lib/supabase';
import { PAGE_SIZE, offsetFor } from './searchModel';
import { mapSearchRows, type SearchResult } from './searchMap';

export { mapSearchRows } from './searchMap';
export type { SearchHit, SearchResult } from './searchMap';

export async function searchPlaces(o: { q: string; province: string; category: string; page: number }): Promise<SearchResult> {
  const { data, error } = await supabase.rpc('search_places', {
    p_q: o.q,
    p_province: o.province || null,
    p_category: o.category || null,
    p_limit: PAGE_SIZE,
    p_offset: offsetFor(o.page),
  });
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    const msg = (error as { message?: string }).message ?? '';
    console.error('[thai77] search failed', code, msg);
    if (code === 'PGRST202' || code === '42883' || /could not find the function/i.test(msg)) {
      throw new Error('ยังไม่ได้รัน Migration 008 ใน Supabase (ฟังก์ชันค้นหา)');
    }
    throw new Error('ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
  return mapSearchRows(data);
}
