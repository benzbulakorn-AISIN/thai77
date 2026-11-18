import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FeatureCollection, Geometry } from 'geojson';
import { ArrowLeft, CalendarDays, Landmark, MapPinned } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { escapeHtml } from '../lib/escapeHtml';
import { GeoMap } from '../features/map/GeoMap';
import { loadDistrictShapes, type DistrictGeoProps } from '../features/map/geoLoader';
import { primaryColor } from '../features/map/colors';
import { useReference, type District } from '../features/provinces/useGeoData';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';

const PALETTE = ['#93C5FD', '#86EFAC', '#FDE68A', '#FDBA74', '#C4B5FD', '#F9A8D4', '#99F6E4', '#BEF264'];

export function ProvincePage() {
  const { slug } = useParams();
  const { provinces, regions, loading } = useReference();
  const province = provinces.find((p) => p.slug === slug);
  const region = regions.find((r) => r.id === province?.region_id);

  const [districts, setDistricts] = useState<District[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [shapes, setShapes] = useState<FeatureCollection<Geometry, DistrictGeoProps> | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // district pcode

  useEffect(() => {
    if (!province) return;
    let alive = true;
    setDistricts(null); setShapes(null); setGeoError(false); setSelected(null);
    supabase.from('districts').select('id,pcode,name_th,name_en').eq('province_id', province.id).order('name_th')
      .then(({ data }) => alive && setDistricts((data ?? []) as District[]));
    supabase.from('places').select('district_id').eq('province_id', province.id)
      .then(({ data }) => {
        if (!alive) return;
        const c: Record<string, number> = {};
        ((data ?? []) as { district_id: string | null }[]).forEach((r) => { if (r.district_id) c[r.district_id] = (c[r.district_id] ?? 0) + 1; });
        setCounts(c);
      });
    loadDistrictShapes(province.pcode).then((d) => alive && setShapes(d)).catch(() => alive && setGeoError(true));
    return () => { alive = false; };
  }, [province]);

  const colorIdx = useMemo(() => {
    const m = new Map<string, number>();
    shapes?.features.forEach((f, i) => m.set(f.properties.pcode, i % PALETTE.length));
    return m;
  }, [shapes]);

  if (loading) return <Skeleton className="h-96" />;
  if (!province) {
    return (
      <EmptyState icon={<MapPinned size={40} />} title="ไม่พบจังหวัดนี้"
        action={<Link to="/" className="text-primary underline">กลับหน้าแรก</Link>} />
    );
  }

  const selDistrict = districts?.find((d) => d.pcode === selected);
  const toggle = (pcode: string) => setSelected((cur) => (cur === pcode ? null : pcode));

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2">
        <Link to="/" aria-label="กลับ" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2">
          <ArrowLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{province.name_th}</h1>
          <p className="text-sm text-muted">{province.name_en} · {region?.name_th}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="flex items-center gap-1 text-xs text-muted"><CalendarDays size={14} /> ช่วงที่เหมาะ</p>
          <p className="font-semibold">{province.best_season ?? 'รอข้อมูล'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="flex items-center gap-1 text-xs text-muted"><Landmark size={14} /> อำเภอ</p>
          <p className="font-semibold">{districts ? `${districts.length} อำเภอ` : '…'}</p>
        </div>
      </section>
      {province.summary && <p className="text-sm">{province.summary}</p>}

      {geoError ? (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">ยังไม่มีไฟล์ขอบเขตอำเภอของจังหวัดนี้</p>
      ) : !shapes ? (
        <Skeleton className="h-[50vh] min-h-[300px]" />
      ) : (
        <GeoMap<DistrictGeoProps>
          data={shapes}
          className="h-[50vh] min-h-[300px] max-h-[600px]"
          getId={(p) => p.pcode}
          selectedId={selected}
          onSelect={toggle}
          onOpen={toggle}
          getTooltip={(p) => `<b>${escapeHtml(p.name_th)}</b>`}
          getStyle={(p, isSel) => ({
            fillColor: PALETTE[colorIdx.get(p.pcode) ?? 0],
            fillOpacity: selected && !isSel ? 0.25 : 0.7,
            color: isSel ? primaryColor() : '#334155',
            weight: isSel ? 3.5 : 1,
          })}
        />
      )}

      <section>
        <h2 className="mb-2 font-semibold">
          {selDistrict ? `อำเภอ${selDistrict.name_th.replace(/^อำเภอ/, '')}` : 'อำเภอทั้งหมด'}
        </h2>
        {!districts ? (
          <Skeleton className="h-40" />
        ) : districts.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีรายชื่ออำเภอ — รัน supabase/seed_geo.sql</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {districts.map((d) => (
              <button key={d.id} type="button" onClick={() => toggle(d.pcode)}
                className={`flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm
                  ${selected === d.pcode ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>
                <span className="truncate">{d.name_th}</span>
                <span className="shrink-0 rounded-full bg-black/10 px-2 text-xs">{counts[d.id] ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <EmptyState icon={<MapPinned size={36} />} title="สถานที่ท่องเที่ยว" text="รายการสถานที่ ตัวกรอง และการเลือกเข้าทริป จะมาใน Part 4.2" />
    </div>
  );
}
