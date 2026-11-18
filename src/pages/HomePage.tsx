import { useEffect, useState } from 'react';
import { Database, Map } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { env } from '../lib/env';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';

type Region = { code: string; name_th: string };

// Phase 3: connection check. Phase 4 replaces with the Thailand map.
export function HomePage() {
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [catCount, setCatCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!env.isConfigured) return;
    Promise.all([
      supabase.from('regions').select('code,name_th').order('sort_order'),
      supabase.from('categories').select('id', { count: 'exact', head: true }),
    ]).then(([r, c]) => {
      if (r.error || c.error) { setError('เชื่อมต่อฐานข้อมูลไม่สำเร็จ'); return; }
      setRegions(r.data ?? []);
      setCatCount(c.count ?? 0);
    });
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">สวัสดี 👋</h1>
      <EmptyState icon={<Map size={40} />} title="แผนที่ 77 จังหวัด" text="จะมาใน Phase 4" />

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Database size={18} /> ทดสอบการเชื่อมต่อ Supabase</h2>
        {error && <p className="text-red-600">{error}</p>}
        {!error && regions === null && env.isConfigured && <Skeleton className="h-20" />}
        {regions && (
          <>
            <p className="mb-2 text-sm text-green-600">✅ เชื่อมต่อสำเร็จ · ภาค {regions.length} · หมวดหมู่ {catCount}</p>
            <div className="flex flex-wrap gap-2">
              {regions.map((r) => (
                <span key={r.code} className="rounded-full bg-surface-2 px-3 py-1 text-sm">{r.name_th}</span>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
