import { useMemo, useState } from 'react';
import { ArrowDownUp, Filter, MapPinned, Search, X } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { useToast } from '../../components/ui/Toast';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { PlaceCard } from './PlaceCard';
import { haversineKm } from './geo';
import { usePlaceCovers } from '../placeImages/usePlaceCovers';
import type { Category, MyPlaceState, Place, UserStatus } from './types';

export type StatusFilter = 'all' | 'none' | 'want' | 'planned' | 'visited' | 'favorite';
type SortKey = 'popular' | 'distance' | 'cost' | 'rating' | 'recent' | 'season';

const STATUS_FILTERS: { k: StatusFilter; label: string }[] = [
  { k: 'all', label: 'ทั้งหมด' },
  { k: 'none', label: 'ยังไม่เคยไป' },
  { k: 'want', label: 'อยากไป' },
  { k: 'planned', label: 'อยู่ในแผนทริป' },
  { k: 'visited', label: 'เคยไปแล้ว' },
  { k: 'favorite', label: 'โปรด' },
];
const SORTS: { k: SortKey; label: string }[] = [
  { k: 'popular', label: 'ความนิยม' },
  { k: 'distance', label: 'ใกล้ฉัน' },
  { k: 'cost', label: 'ค่าใช้จ่ายน้อย' },
  { k: 'rating', label: 'คะแนนของฉัน' },
  { k: 'recent', label: 'เคยไปล่าสุด' },
  { k: 'season', label: 'เหมาะกับเดือนนี้' },
];
const PAGE = 20;

type Props = {
  places: Place[];
  categories: Category[];
  districtNames: Map<string, string>;
  provinceNameTh?: string;
  provinceNameEn?: string | null;
  districtFilter: string | null;
  onClearDistrict: () => void;
  my: {
    get: (id: string) => MyPlaceState;
    setStatus: (id: string, s: UserStatus) => Promise<void>;
    toggleFavorite: (id: string) => Promise<boolean>;
    signedIn: boolean;
  };
  highlightId?: string | null;
};

export function filterAndSort(
  places: Place[], o: { q: string; cat: string; status: StatusFilter; district: string | null; sort: SortKey; me: { lat: number; lng: number } | null },
  get: (id: string) => MyPlaceState,
) {
  const month = new Date().getMonth() + 1;
  const list = places.filter((p) => {
    const s = get(p.id);
    if (o.district && p.district_id !== o.district) return false;
    if (o.cat !== 'all' && p.category_id !== o.cat) return false;
    if (o.q && !(p.name_th.toLowerCase().includes(o.q) || (p.name_en ?? '').toLowerCase().includes(o.q))) return false;
    switch (o.status) {
      case 'none': return s.status !== 'visited';
      case 'want': return s.status === 'want';
      case 'planned': return s.status === 'planned';
      case 'visited': return s.status === 'visited';
      case 'favorite': return s.favorite;
      default: return true;
    }
  });
  const dist = (p: Place) => (o.me && p.lat != null && p.lng != null ? haversineKm(o.me, { lat: p.lat, lng: p.lng }) : Infinity);
  const cost = (p: Place) => p.est_cost_per_person ?? p.fee_thai ?? Infinity;
  const cmp: Record<SortKey, (a: Place, b: Place) => number> = {
    popular: (a, b) => b.popularity - a.popularity,
    distance: (a, b) => dist(a) - dist(b),
    cost: (a, b) => cost(a) - cost(b),
    rating: (a, b) => (get(b.id).rating ?? 0) - (get(a.id).rating ?? 0),
    recent: (a, b) => (get(b.id).lastVisited ?? '').localeCompare(get(a.id).lastVisited ?? ''),
    season: (a, b) => Number(b.best_months.includes(month)) - Number(a.best_months.includes(month)),
  };
  return [...list].sort((a, b) => cmp[o.sort](a, b) || a.name_th.localeCompare(b.name_th, 'th'));
}

export function PlaceList({ places, categories, districtNames, provinceNameTh, provinceNameEn, districtFilter, onClearDistrict, my, highlightId }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim().toLowerCase(), 250);
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('popular');
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const usedCats = useMemo(() => {
    const ids = new Set(places.map((p) => p.category_id));
    return categories.filter((c) => c.is_active && ids.has(c.id));
  }, [places, categories]);

  const list = useMemo(
    () => filterAndSort(places, { q, cat, status, district: districtFilter, sort, me }, my.get),
    [places, q, cat, status, districtFilter, sort, me, my.get],
  );

  // covers are fetched only for the cards that are on screen
  const visible = list.slice(0, limit);
  const covers = usePlaceCovers(visible.map((p) => ({
    id: p.id, nameTh: p.name_th, nameEn: p.name_en, provinceTh: provinceNameTh, provinceEn: provinceNameEn,
  })));

  const onSort = (k: SortKey) => {
    if (k === 'distance' && !me) {
      if (!navigator.geolocation) { toast('อุปกรณ์นี้หาตำแหน่งไม่ได้', 'error'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => { setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setSort('distance'); },
        () => toast('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง', 'error'),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
      );
      return;
    }
    setSort(k);
  };

  const resetAll = () => { setQuery(''); setCat('all'); setStatus('all'); onClearDistrict(); };
  const filtered = Boolean(q || cat !== 'all' || status !== 'all' || districtFilter);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">สถานที่ท่องเที่ยว <span className="text-sm font-normal text-muted">({list.length})</span></h2>
        {filtered && (
          <button type="button" onClick={resetAll} className="inline-flex min-h-10 items-center gap-1 text-sm text-primary">
            <X size={16} /> ล้างตัวกรอง
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
          placeholder="ค้นหาสถานที่" aria-label="ค้นหาสถานที่" className="input pl-10" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="relative">
          <span className="sr-only">หมวดหมู่</span>
          <Filter size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <select value={cat} onChange={(e) => { setCat(e.target.value); setLimit(PAGE); }} className="input pl-9">
            <option value="all">ทุกหมวด</option>
            {usedCats.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}
          </select>
        </label>
        <label className="relative">
          <span className="sr-only">เรียงตาม</span>
          <ArrowDownUp size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)} className="input pl-9">
            {SORTS.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATUS_FILTERS.map((s) => (
          <button key={s.k} type="button" onClick={() => { setStatus(s.k); setLimit(PAGE); }}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm ${status === s.k ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {districtFilter && (
        <p className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-sm">
          อำเภอ: {districtNames.get(districtFilter)}
          <button type="button" aria-label="ล้างอำเภอ" onClick={onClearDistrict}><X size={14} /></button>
        </p>
      )}
      {sort === 'season' && <p className="text-xs text-muted">ใช้ข้อมูลฤดูกาลเท่าที่มี สถานที่ที่ยังไม่มีข้อมูลจะอยู่ท้ายรายการ</p>}

      {places.length === 0 ? (
        <EmptyState icon={<MapPinned size={36} />} title="ยังไม่มีสถานที่ในจังหวัดนี้" text="Admin เพิ่มได้ในหน้า Admin" />
      ) : list.length === 0 ? (
        <EmptyState icon={<Search size={36} />} title="ไม่พบสถานที่ตามตัวกรอง"
          action={<Button variant="secondary" onClick={resetAll}>ล้างตัวกรอง</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => (
            <PlaceCard key={p.id} place={p} category={catById.get(p.category_id)}
              districtName={p.district_id ? districtNames.get(p.district_id) : undefined}
              distanceKm={me && p.lat != null && p.lng != null ? haversineKm(me, { lat: p.lat, lng: p.lng }) : null}
              cover={covers.get(p.id) ?? null}
              state={my.get(p.id)} signedIn={my.signedIn}
              onStatus={(s) => my.setStatus(p.id, s)} onFavorite={() => my.toggleFavorite(p.id)}
              highlighted={highlightId === p.id} dense />
          ))}
        </div>
      )}
      {list.length > limit && (
        <Button variant="secondary" className="w-full" onClick={() => setLimit((n) => n + PAGE)}>
          แสดงเพิ่ม ({list.length - limit})
        </Button>
      )}
    </section>
  );
}
