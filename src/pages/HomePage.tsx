import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FeatureCollection, Geometry } from 'geojson';
import { ArrowRight, MapPin, Search, Trophy, X } from 'lucide-react';
import { GeoMap } from '../features/map/GeoMap';
import { Legend } from '../features/map/Legend';
import { loadProvinceShapes, type ProvinceGeoProps } from '../features/map/geoLoader';
import { primaryColor, statusColor } from '../features/map/colors';
import { statusOf, useProvinceStats, useReference, type Province } from '../features/provinces/useGeoData';
import { useDebounce } from '../hooks/useDebounce';
import { escapeHtml } from '../lib/escapeHtml';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';

export function HomePage() {
  const nav = useNavigate();
  const { regions, provinces, error: refError, loading } = useReference();
  const stats = useProvinceStats();
  const [shapes, setShapes] = useState<FeatureCollection<Geometry, ProvinceGeoProps> | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [region, setRegion] = useState<string>('all');
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim().toLowerCase(), 250);
  const [selected, setSelected] = useState<string | null>(null); // pcode

  useEffect(() => {
    loadProvinceShapes().then(setShapes).catch((e: Error) => setGeoError(e.message));
  }, []);

  const byPcode = useMemo(() => new Map(provinces.map((p) => [p.pcode, p])), [provinces]);
  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const regionCodeOf = (p?: Province) => (p ? regionById.get(p.region_id)?.code : undefined);

  const inRegion = (p?: Province) => region === 'all' || regionCodeOf(p) === region;
  const matches = useMemo(
    () => (q ? provinces.filter((p) => inRegion(p) && (p.name_th.includes(q) || p.name_en.toLowerCase().includes(q))).slice(0, 8) : []),
    [q, provinces, region, regionById],
  );
  const fitIds = region === 'all' ? null : provinces.filter((p) => regionCodeOf(p) === region).map((p) => p.pcode);

  const totals = useMemo(() => {
    let total = 0, planned = 0, visited = 0, provVisited = 0;
    Object.values(stats).forEach((s) => {
      total += s.total; planned += s.planned; visited += s.visited;
      if (s.visited > 0) provVisited++;
    });
    return { total, planned, visited, provVisited };
  }, [stats]);
  const pct = Math.round((totals.provVisited / 77) * 100);

  const sel = selected ? byPcode.get(selected) : undefined;
  const selStat = sel ? stats[sel.id] : undefined;
  const open = (pcode: string) => {
    const p = byPcode.get(pcode);
    if (p) nav(`/province/${p.slug}`);
  };

  return (
    <div className="space-y-4">
      {/* search */}
      <div className="relative">
        <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาจังหวัด"
          aria-label="ค้นหาจังหวัด"
          className="input pl-10 pr-10"
        />
        {query && (
          <button type="button" aria-label="ล้างคำค้น" onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted">
            <X size={18} />
          </button>
        )}
        {matches.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-[600] mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { setQuery(''); setSelected(p.pcode); nav(`/province/${p.slug}`); }}
                  className="flex min-h-12 w-full items-center gap-2 px-3 text-left hover:bg-surface-2">
                  <MapPin size={18} className="text-primary" />
                  <span className="flex-1">{p.name_th}</span>
                  <span className="text-xs text-muted">{regionById.get(p.region_id)?.name_th}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && matches.length === 0 && !loading && (
          <p className="mt-1 text-sm text-muted">ไม่พบจังหวัด “{query}”</p>
        )}
      </div>

      {/* region chips */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ code: 'all', name_th: 'ทั้งหมด' }, ...regions].map((r) => (
          <button key={r.code} type="button" onClick={() => { setRegion(r.code); setSelected(null); }}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm ${region === r.code ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>
            {r.name_th}
          </button>
        ))}
      </div>

      {/* map */}
      {geoError ? (
        <EmptyState icon={<MapPin size={40} />} title="ยังไม่มีไฟล์แผนที่"
          text="ไปที่ GitHub → Actions → Build Geo Data → Run workflow แล้วรอ Deploy ใหม่" />
      ) : !shapes ? (
        <Skeleton className="h-[60vh] min-h-[320px]" />
      ) : (
        <GeoMap<ProvinceGeoProps>
          data={shapes}
          className="h-[60vh] min-h-[320px] max-h-[720px]"
          getId={(p) => p.pcode}
          selectedId={selected}
          fitIds={fitIds}
          onSelect={setSelected}
          onOpen={open}
          getTooltip={(g) => {
            const p = byPcode.get(g.pcode);
            const r = p ? regionById.get(p.region_id)?.name_th : '';
            return `<b>${escapeHtml(g.name_th)}</b><br/>${escapeHtml(r ?? '')}`;
          }}
          getStyle={(g, isSel) => {
            const p = byPcode.get(g.pcode);
            const dim = !inRegion(p);
            return {
              fillColor: statusColor(statusOf(p ? stats[p.id] : undefined)),
              fillOpacity: dim ? 0.12 : 0.75,
              color: isSel ? primaryColor() : '#ffffff',
              weight: isSel ? 3 : 0.8,
              opacity: dim ? 0.4 : 1,
            };
          }}
        />
      )}
      <Legend />

      {refError && <p className="text-sm text-red-600">{refError}</p>}
      {!loading && !refError && provinces.length === 0 && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
          ยังไม่มีรายชื่อจังหวัดในฐานข้อมูล — รันไฟล์ supabase/seed_geo.sql ใน Supabase SQL Editor
        </p>
      )}

      {/* selected province card */}
      {sel && (
        <section className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{sel.name_th}</p>
            <p className="text-sm text-muted">
              {regionById.get(sel.region_id)?.name_th} · {selStat?.total ?? 0} สถานที่ · ไปแล้ว {selStat?.visited ?? 0}
            </p>
          </div>
          <Button icon={<ArrowRight size={20} />} onClick={() => nav(`/province/${sel.slug}`)}>ดูจังหวัด</Button>
        </section>
      )}

      {/* summary */}
      <section className="grid grid-cols-3 gap-2 text-center">
        {[
          { n: totals.total, l: 'สถานที่ทั้งหมด' },
          { n: totals.planned, l: 'เลือกไว้' },
          { n: totals.visited, l: 'ไปแล้ว' },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-line bg-surface p-3">
            <p className="text-2xl font-bold text-primary">{s.n}</p>
            <p className="text-xs text-muted">{s.l}</p>
          </div>
        ))}
      </section>
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="mb-2 flex items-center gap-2 font-semibold">
          <Trophy size={18} className="text-amber-500" /> ไปแล้ว {totals.provVisited}/77 จังหวัด ({pct}%)
        </p>
        <div className="h-3 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>
    </div>
  );
}
