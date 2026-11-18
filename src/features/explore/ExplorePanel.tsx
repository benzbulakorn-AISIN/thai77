import { Link } from 'react-router-dom';
import { ArrowRight, Check, Search, X } from 'lucide-react';
import { Legend } from '../map/Legend';
import { statusColor } from '../map/colors';
import { RegionImage } from '../../components/ui/RegionImage';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import type { ProvinceRow, RegionCard } from './exploreModel';
import type { WantPlace } from './exploreApi';

type Props = {
  level: 1 | 2;
  hasData: boolean;
  cards: RegionCard[];
  card: RegionCard | null;
  rows: ProvinceRow[];
  selectedPcode: string | null;
  query: string;
  onQuery: (v: string) => void;
  results: { pcode: string; name: string; regionName: string }[];
  onPickRegion: (code: string) => void;
  onPickProvince: (pcode: string) => void;
  onOpenProvince: (slug: string) => void;
  onPickResult: (pcode: string) => void;
  want: { items: WantPlace[]; loading: boolean; error: string | null; signedIn: boolean };
  provinceName: (provinceId: string) => string;
  inCart: (placeId: string) => boolean;
  onRemoveWant: (placeId: string) => void;
};

/** Content of the Explore side panel / bottom sheet. (The primary "จัดทริป" button lives in the sheet footer.) */
export function ExplorePanel(p: Props) {
  const selected = p.rows.find((r) => r.pcode === p.selectedPcode) ?? null;
  const searching = p.query.trim() !== '';

  return (
    <div className="space-y-5 pt-2">
      {/* search */}
      <div>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={p.query} onChange={(e) => p.onQuery(e.target.value)} placeholder="ค้นหาจังหวัด" aria-label="ค้นหาจังหวัด"
            className="input pl-10 pr-10" />
          {searching && (
            <button type="button" aria-label="ล้างคำค้น" onClick={() => p.onQuery('')}
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted"><X size={18} /></button>
          )}
        </div>
        {searching && (
          p.results.length > 0 ? (
            <ul className="mt-1 overflow-hidden rounded-xl border border-line">
              {p.results.map((r) => (
                <li key={r.pcode} className="border-b border-line last:border-b-0">
                  <button type="button" onClick={() => p.onPickResult(r.pcode)}
                    className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left hover:bg-surface-2">
                    <span>{r.name}</span><span className="text-xs text-muted">{r.regionName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">ไม่พบจังหวัด “{p.query.trim()}”</p>
        )}
      </div>

      {!p.hasData && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
          ยังไม่มีรายชื่อจังหวัดในฐานข้อมูล — รัน supabase/seed_geo.sql ใน Supabase SQL Editor
        </p>
      )}

      {/* level 1: regions */}
      {p.level === 1 && p.cards.length > 0 && (
        <section aria-label="ภาค">
          <div className="grid grid-cols-2 gap-3">
            {p.cards.map((c) => (
              <button key={c.code} type="button" onClick={() => p.onPickRegion(c.code)}
                className="overflow-hidden rounded-2xl border border-line bg-surface text-left active:scale-[0.99]">
                <RegionImage code={c.code} name={c.name} color={c.color} square />
                <span className="block p-2">
                  <span className="flex items-start gap-2 font-semibold leading-tight">
                    <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="min-w-0">{c.name}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{c.provinceCount} จังหวัด · ไปแล้ว {c.visitedCount}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* level 2: provinces of the region */}
      {p.level === 2 && p.card && (
        <section aria-label={`จังหวัดใน${p.card.name}`} className="space-y-3">
          <Legend />
          {selected && (
            <div className="space-y-2 rounded-2xl border-2 border-primary bg-surface-2 p-3">
              <p className="text-lg font-bold">{selected.name}</p>
              <p className="text-sm text-muted">{selected.total} สถานที่ · เคยไป {selected.visited} · อยู่ในแผน {selected.planned}</p>
              <Button variant="secondary" className="w-full" icon={<ArrowRight size={20} />} onClick={() => p.onOpenProvince(selected.slug)}>
                ดูจังหวัด
              </Button>
            </div>
          )}
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {p.rows.map((r) => (
              <li key={r.pcode}>
                <button type="button" onClick={() => p.onPickProvince(r.pcode)} aria-pressed={r.pcode === p.selectedPcode}
                  className={`flex min-h-12 w-full items-center gap-3 px-3 text-left ${r.pcode === p.selectedPcode ? 'bg-surface-2 font-semibold' : ''}`}>
                  <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10" style={{ background: statusColor(r.status) }} />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-xs text-muted">{r.total} แห่ง</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* interested places */}
      <section aria-label="ที่สนใจ" className="space-y-2">
        <h3 className="font-semibold">ที่สนใจ <span className="text-sm font-normal text-muted">({p.want.items.length})</span></h3>
        {!p.want.signedIn ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
            <Link to="/auth/login" className="text-primary underline">เข้าสู่ระบบ</Link> เพื่อเก็บรายการที่อยากไป
            (ใส่ทริปได้เลยโดยไม่ต้องเข้าสู่ระบบ)
          </p>
        ) : p.want.loading ? (
          <Skeleton className="h-14" />
        ) : p.want.error ? (
          <p className="text-sm text-red-600">{p.want.error}</p>
        ) : p.want.items.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มี — เปิดหน้าจังหวัด แล้วกด “อยากไป” ที่สถานที่ที่สนใจ</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {p.want.items.slice(0, 30).map((w) => (
              <li key={w.id} className="flex items-center gap-1 pl-3">
                <Link to={`/place/${w.id}`} className="min-w-0 flex-1 py-2">
                  <span className="block truncate font-medium">{w.name_th}</span>
                  <span className="block truncate text-xs text-muted">{p.provinceName(w.province_id)}</span>
                </Link>
                {p.inCart(w.id) && <span className="inline-flex items-center gap-1 text-xs text-green-700"><Check size={14} /> ในตะกร้า</span>}
                <button type="button" aria-label={`เอา ${w.name_th} ออกจากที่สนใจ`} onClick={() => p.onRemoveWant(w.id)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center text-muted"><X size={18} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] leading-snug text-muted">
        ภาพภาคเป็นภาพประกอบที่สร้างด้วย AI · ขอบเขตจังหวัด/อำเภอ: OCHA COD-AB / กรมแผนที่ทหาร (CC BY 3.0 IGO) · แผนที่ย่อเพื่อแสดงผล ไม่ใช่เส้นเขตทางการ
      </p>
    </div>
  );
}
