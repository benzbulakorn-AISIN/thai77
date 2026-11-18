import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, LogIn, MapPin, Search, Trophy } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { useReference } from '../features/provinces/useGeoData';
import { fetchCategories } from '../features/places/placesApi';
import { CategoryIcon } from '../features/places/categoryIcons';
import type { Category } from '../features/places/types';
import { coverUrls, listVisits, type VisitRow } from '../features/memories/memoriesApi';
import { Stars } from '../features/memories/StarRating';
import { fmtDateTh } from '../features/routing/time';
import { useDebounce } from '../hooks/useDebounce';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';

type GroupBy = 'province' | 'year' | 'trip';
type Group = { key: string; title: string; items: VisitRow[] };

export function MemoriesPage() {
  const { user, loading: authLoading } = useAuth();
  const { provinces } = useReference();
  const [visits, setVisits] = useState<VisitRow[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [covers, setCovers] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [by, setBy] = useState<GroupBy>('province');
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim().toLowerCase(), 250);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchCategories().then((c) => alive && setCats(c)).catch(() => undefined);
    listVisits()
      .then(async (v) => {
        if (!alive) return;
        setVisits(v);
        const c = await coverUrls(v);
        if (alive) setCovers(c);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [user]);

  const provName = useMemo(() => new Map(provinces.map((p) => [p.id, p.name_th])), [provinces]);
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  const stats = useMemo(() => {
    const vs = visits ?? [];
    const provSet = new Set(vs.map((v) => v.province_id).filter(Boolean));
    const placeSet = new Set(vs.map((v) => v.place_id ?? v.user_place_id ?? v.place_name));
    const catCount = new Map<string, number>();
    vs.forEach((v) => { if (v.category_id) catCount.set(v.category_id, (catCount.get(v.category_id) ?? 0) + 1); });
    const top = [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { provinces: provSet.size, places: placeSet.size, pct: Math.round((provSet.size / 77) * 100), top };
  }, [visits]);

  const groups: Group[] = useMemo(() => {
    const vs = (visits ?? []).filter((v) => !q || v.place_name.toLowerCase().includes(q));
    const m = new Map<string, Group>();
    for (const v of vs) {
      let key: string, title: string;
      if (by === 'province') { key = v.province_id ?? '-'; title = (v.province_id && provName.get(v.province_id)) || 'ไม่ระบุจังหวัด'; }
      else if (by === 'year') { key = v.visited_on.slice(0, 4); title = `ปี ${Number(key) + 543}`; }
      else { key = v.trip_id ?? '-'; title = v.trip_name ?? 'ไม่ระบุทริป'; }
      const g = m.get(key) ?? { key, title, items: [] };
      g.items.push(v);
      m.set(key, g);
    }
    const list = [...m.values()];
    if (by === 'province') list.sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title, 'th'));
    else if (by === 'year') list.sort((a, b) => b.key.localeCompare(a.key));
    else list.sort((a, b) => (a.key === '-' ? 1 : b.key === '-' ? -1 : b.items[0].visited_on.localeCompare(a.items[0].visited_on)));
    return list;
  }, [visits, q, by, provName]);

  if (authLoading) return <Skeleton className="h-40" />;
  if (!user) {
    return (
      <EmptyState icon={<Camera size={40} />} title="เข้าสู่ระบบเพื่อดูความทรงจำ" text="บันทึกสถานที่ที่ไปมาแล้ว พร้อมรูปและรีวิวของคุณเอง"
        action={<Link to="/auth/login"><Button icon={<LogIn size={20} />}>เข้าสู่ระบบ</Button></Link>} />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ความทรงจำของฉัน</h1>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Trophy size={18} className="text-amber-500" /> ไปแล้ว {stats.provinces}/77 จังหวัด ({stats.pct}%) · {stats.places} สถานที่
        </p>
        <div className="h-3 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${stats.pct}%` }} />
        </div>
        {stats.top.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">ไปบ่อย:</span>
            {stats.top.map(([id, n]) => {
              const c = catById.get(id);
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1">
                  <span style={{ color: c?.color }}><CategoryIcon name={c?.icon} size={14} /></span> {c?.name_th ?? 'อื่นๆ'} {n}
                </span>
              );
            })}
          </div>
        )}
      </section>

      <div className="relative">
        <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อสถานที่" aria-label="ค้นหาชื่อสถานที่" className="input pl-10" />
      </div>

      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-surface text-sm" role="tablist">
        {([['province', 'จังหวัด'], ['year', 'ปี'], ['trip', 'ทริป']] as [GroupBy, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={by === k} onClick={() => setBy(k)}
            className={`min-h-11 ${by === k ? 'bg-primary text-on-primary' : ''}`}>{l}</button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!visits && !error && <div className="grid grid-cols-2 gap-3"><Skeleton className="aspect-square" /><Skeleton className="aspect-square" /></div>}
      {visits && visits.length === 0 && (
        <EmptyState icon={<Camera size={40} />} title="ยังไม่มีความทรงจำ" text="เปิดหน้าสถานที่ แล้วกด “บันทึกการไป” เพื่อเก็บวันที่ รูป และความประทับใจ"
          action={<Link to="/" className="text-primary underline">ไปเลือกสถานที่</Link>} />
      )}
      {visits && visits.length > 0 && groups.length === 0 && <p className="text-sm text-muted">ไม่พบ “{query}”</p>}

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h2 className="font-semibold">{g.title} <span className="text-sm font-normal text-muted">({g.items.length})</span></h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {g.items.map((v) => {
              const c = v.category_id ? catById.get(v.category_id) : undefined;
              const url = covers.get(v.id);
              return (
                <Link key={v.id} to={`/memories/${v.id}`} className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <div className="flex aspect-square items-center justify-center bg-surface-2" style={url ? undefined : { color: c?.color ?? '#64748B' }}>
                    {url ? <img src={url} alt={v.place_name} loading="lazy" className="h-full w-full object-cover" /> : <CategoryIcon name={c?.icon} size={40} />}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-sm font-medium">{v.place_name}</p>
                    <p className="flex items-center justify-between gap-1 text-xs text-muted">
                      <span className="truncate">{fmtDateTh(v.visited_on, true)}</span>
                      <Stars value={v.rating} size={12} />
                    </p>
                    {by !== 'province' && v.province_id && (
                      <p className="flex items-center gap-1 truncate text-xs text-muted"><MapPin size={11} /> {provName.get(v.province_id)}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
