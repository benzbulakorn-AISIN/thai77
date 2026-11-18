import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, EyeOff, MapPinOff, Plus, Search } from 'lucide-react';
import { useReference } from '../../features/provinces/useGeoData';
import {
  emptyFilter, listAllCategories, listPlaces, PAGE_SIZE, setPublished, staleCutoff, type AdminCategory, type AdminPlaceRow, type PlaceFilter,
} from '../../features/admin/adminApi';
import { VerificationBadge } from '../../features/places/VerificationBadge';
import { useDebounce } from '../../hooks/useDebounce';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

const KEYS: (keyof PlaceFilter)[] = ['q', 'provinceId', 'categoryId', 'verification', 'published', 'demo', 'problem'];

export function AdminPlacesPage() {
  const toast = useToast();
  const { provinces } = useReference();
  const [params, setParams] = useSearchParams();
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [data, setData] = useState<{ rows: AdminPlaceRow[]; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const filter: PlaceFilter = useMemo(() => {
    const f = emptyFilter();
    KEYS.forEach((k) => { const v = params.get(k); if (v) (f as Record<string, unknown>)[k] = v; });
    f.page = Math.max(0, Number(params.get('page')) || 0);
    return f;
  }, [params]);
  const [qInput, setQInput] = useState(filter.q);
  const q = useDebounce(qInput, 300);

  const setF = (patch: Partial<PlaceFilter>) => {
    const next = { ...filter, page: 0, ...patch };
    const p = new URLSearchParams();
    KEYS.forEach((k) => { const v = next[k]; if (v) p.set(k, String(v)); });
    if (next.page) p.set('page', String(next.page));
    setParams(p, { replace: true });
  };

  useEffect(() => { if (q !== filter.q) setF({ q }); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listAllCategories().then(setCats).catch(() => setCats([]));
    staleCutoff().then((s) => setCutoff(s.cutoff)).catch(() => setCutoff('1900-01-01'));
  }, []);

  const reload = () => {
    if (!cutoff) return;
    setData(null);
    listPlaces(filter, cutoff).then((d) => { setData(d); setSelected(new Set()); setError(null); }).catch((e: Error) => setError(e.message));
  };
  useEffect(reload, [filter, cutoff]); // eslint-disable-line react-hooks/exhaustive-deps

  const provName = useMemo(() => new Map(provinces.map((p) => [p.id, p.name_th])), [provinces]);
  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name_th])), [cats]);
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  const bulk = async (pub: boolean) => {
    setBusy(true);
    try { await setPublished([...selected], pub); toast(pub ? 'เปิดการแสดงแล้ว' : 'ปิดการแสดงแล้ว', 'success'); reload(); }
    catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const sel = (label: string, value: string, onChange: (v: string) => void, opts: [string, string][]) => (
    <label className="block text-xs text-muted">{label}
      <select className="input mt-1 min-h-10 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="ค้นหาชื่อสถานที่" aria-label="ค้นหาชื่อสถานที่" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <Link to="/admin/places/new"><Button icon={<Plus size={20} />}>เพิ่ม</Button></Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sel('จังหวัด', filter.provinceId, (v) => setF({ provinceId: v }), [['', 'ทุกจังหวัด'], ...provinces.map((p) => [p.id, p.name_th] as [string, string])])}
        {sel('หมวด', filter.categoryId, (v) => setF({ categoryId: v }), [['', 'ทุกหมวด'], ...cats.map((c) => [c.id, c.name_th] as [string, string])])}
        {sel('สถานะข้อมูล', filter.verification, (v) => setF({ verification: v as PlaceFilter['verification'] }),
          [['', 'ทั้งหมด'], ['verified', 'ตรวจแล้ว'], ['pending', 'รอตรวจสอบ'], ['outdated', 'ข้อมูลเก่า'], ['demo', 'Demo']])}
        {sel('ปัญหา', filter.problem, (v) => setF({ problem: v as PlaceFilter['problem'] }),
          [['', 'ไม่กรอง'], ['stale', 'ข้อมูลเก่า/หมดอายุ'], ['nocoords', 'ไม่มีพิกัด']])}
        {sel('การแสดง', filter.published, (v) => setF({ published: v as PlaceFilter['published'] }), [['', 'ทั้งหมด'], ['yes', 'เปิด'], ['no', 'ปิด']])}
        {sel('Demo Data', filter.demo, (v) => setF({ demo: v as PlaceFilter['demo'] }), [['', 'ทั้งหมด'], ['yes', 'เฉพาะ Demo'], ['no', 'ไม่ใช่ Demo']])}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2 text-sm">
          <span className="flex-1 px-2">เลือก {selected.size} รายการ</span>
          <Button variant="secondary" className="min-h-10" disabled={busy} icon={<Eye size={16} />} onClick={() => void bulk(true)}>เปิดแสดง</Button>
          <Button variant="secondary" className="min-h-10" disabled={busy} icon={<EyeOff size={16} />} onClick={() => void bulk(false)}>ปิดแสดง</Button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
      {data && data.rows.length === 0 && <EmptyState icon={<Search size={36} />} title="ไม่พบสถานที่" />}
      {data && data.rows.length > 0 && (
        <>
          <p className="text-xs text-muted">ทั้งหมด {data.count.toLocaleString('th-TH')} รายการ</p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {data.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 pl-2">
                <input type="checkbox" aria-label={`เลือก ${r.name_th}`} className="h-5 w-5 shrink-0" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                <Link to={`/admin/places/${r.id}`} className="flex min-w-0 flex-1 items-center gap-2 p-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${r.is_published ? '' : 'text-muted line-through'}`}>{r.name_th}</span>
                    <span className="block truncate text-xs text-muted">{provName.get(r.province_id) ?? '—'} · {catName.get(r.category_id) ?? '—'}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <VerificationBadge place={r} small />
                      {r.lat == null && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 text-[11px] text-red-800"><MapPinOff size={11} /> ไม่มีพิกัด</span>}
                      {!r.is_published && <span className="rounded-full bg-slate-200 px-2 text-[11px] text-slate-800">ปิดแสดง</span>}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between">
            <Button variant="ghost" className="border border-line" disabled={filter.page === 0} icon={<ChevronLeft size={18} />}
              onClick={() => setF({ page: filter.page - 1 })}>ก่อนหน้า</Button>
            <span className="text-sm text-muted">หน้า {filter.page + 1}/{pages}</span>
            <Button variant="ghost" className="border border-line" disabled={filter.page + 1 >= pages}
              onClick={() => setF({ page: filter.page + 1 })}>ถัดไป <ChevronRight size={18} /></Button>
          </div>
        </>
      )}
    </div>
  );
}
