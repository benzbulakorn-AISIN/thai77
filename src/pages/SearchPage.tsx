import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, History, Search, SearchX, TriangleAlert, X } from 'lucide-react';
import { useReference } from '../features/provinces/useGeoData';
import { searchProvinces } from '../features/explore/exploreModel';
import { fetchCategories } from '../features/places/placesApi';
import { CategoryIcon } from '../features/places/categoryIcons';
import { VerificationBadge } from '../features/places/VerificationBadge';
import { PlaceImageView } from '../features/placeImages/PlaceImage';
import { usePlaceCovers } from '../features/placeImages/usePlaceCovers';
import type { Category } from '../features/places/types';
import { Highlight } from '../features/search/Highlight';
import { loadRecent, removeRecent, addRecent, saveRecent } from '../features/search/recentSearches';
import { searchPlaces, type SearchResult } from '../features/search/searchApi';
import {
  MIN_QUERY_CHARS, buildSearchParams, cleanQuery, pageCount, parseSearchParams, rangeText,
} from '../features/search/searchModel';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useDebounce } from '../hooks/useDebounce';

const EXAMPLES = ['ชลบุรี วัด', 'น้ำตก เชียงใหม่', 'ชายหาด', 'ตลาดน้ำ'];

type Status = 'idle' | 'short' | 'loading' | 'ok' | 'error';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const url = useMemo(() => parseSearchParams(params), [params]);
  const clean = useMemo(() => cleanQuery(url.q), [url.q]);
  const { provinces } = useReference();
  const [cats, setCats] = useState<Category[]>([]);
  const [input, setInput] = useState(url.q);
  const debounced = useDebounce(input, 300);
  const pushed = useRef(url.q); // the q we last wrote to the URL ourselves
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const reqId = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchCategories().then(setCats).catch(() => setCats([])); }, []);

  // typed text -> URL (after a short pause); keeps filters, goes back to page 1
  useEffect(() => {
    if (debounced === url.q) return;
    pushed.current = debounced;
    setParams(buildSearchParams({ ...url, q: debounced, page: 1 }), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // URL -> typed text (browser back/forward, or a link with ?q=) without overwriting what the user is typing now
  useEffect(() => {
    if (url.q !== pushed.current) { pushed.current = url.q; setInput(url.q); }
  }, [url.q]);

  // run the search
  useEffect(() => {
    if (!clean.q) { setStatus('idle'); setResult(null); setError(null); return; }
    if (!clean.valid) { setStatus('short'); setResult(null); setError(null); return; }
    const id = ++reqId.current;
    setStatus('loading'); setError(null);
    searchPlaces({ q: clean.q, province: url.province, category: url.category, page: url.page })
      .then((r) => {
        if (id !== reqId.current) return; // an older request finished late
        setResult(r); setStatus('ok');
        if (r.total > 0 && url.page === 1) {
          setRecent((cur) => { const next = addRecent(cur, clean.q); saveRecent(next); return next; });
        }
      })
      .catch((e: Error) => { if (id === reqId.current) { setError(e.message); setStatus('error'); } });
  }, [clean.q, clean.valid, url.province, url.category, url.page, retry]);

  const hits = result?.hits ?? [];
  const covers = usePlaceCovers(hits.map((h) => h.id));
  const provName = useMemo(() => new Map(provinces.map((p) => [p.id, p.name_th])), [provinces]);
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const provinceMatches = useMemo(() => (status === 'ok' ? searchProvinces(provinces, clean.q, 3) : []), [status, provinces, clean.q]);

  const set = useCallback((next: Partial<typeof url>, replace = false) => {
    setParams(buildSearchParams({ ...url, ...next }), { replace });
  }, [url, setParams]);

  const submit = (e: FormEvent) => { e.preventDefault(); pushed.current = input; set({ q: input, page: 1 }, true); };
  const setQuery = (q: string) => { setInput(q); pushed.current = q; set({ q, page: 1 }, false); };
  const clear = () => { setInput(''); pushed.current = ''; set({ q: '', page: 1 }, true); };
  const goPage = (p: number) => { set({ page: p }); topRef.current?.scrollIntoView({ block: 'start' }); };
  const resetFilters = () => set({ province: '', category: '', page: 1 }, true);
  const filtered = Boolean(url.province || url.category);

  const pages = result ? pageCount(result.total) : 0;
  const beyond = status === 'ok' && result !== null && result.hits.length === 0 && result.total === 0 && url.page > 1;

  return (
    <div className="space-y-4" ref={topRef}>
      <h1 className="text-2xl font-bold">ค้นหา</h1>

      <form onSubmit={submit} role="search" className="space-y-3">
        <div className="relative">
          <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search" enterKeyHint="search" autoComplete="off" autoFocus={!url.q}
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') clear(); }}
            placeholder="ชื่อสถานที่ จังหวัด อำเภอ หรือหมวด" aria-label="ค้นหาสถานที่"
            maxLength={200}
            className="input pl-10 pr-12 [&::-webkit-search-cancel-button]:hidden"
          />
          {input && (
            <button type="button" aria-label="ล้างคำค้น" onClick={clear}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted"><X size={18} /></button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-muted">จังหวัด
            <select className="input mt-1 min-h-11 text-sm text-fg" value={url.province} onChange={(e) => set({ province: e.target.value, page: 1 }, true)}>
              <option value="">ทุกจังหวัด</option>
              {provinces.map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted">หมวด
            <select className="input mt-1 min-h-11 text-sm text-fg" value={url.category} onChange={(e) => set({ category: e.target.value, page: 1 }, true)}>
              <option value="">ทุกหมวด</option>
              {cats.filter((c) => c.is_active || c.id === url.category).map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}
            </select>
          </label>
        </div>
        {filtered && (
          <button type="button" onClick={resetFilters} className="inline-flex min-h-10 items-center gap-1 text-sm text-primary"><X size={16} /> ล้างตัวกรอง</button>
        )}
      </form>

      {/* idle: recent searches + examples */}
      {status === 'idle' && (
        <section className="space-y-4" aria-label="ตัวช่วยค้นหา">
          {recent.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><History size={16} /> ค้นหาล่าสุด</h2>
                <button type="button" onClick={() => { setRecent([]); saveRecent([]); }} className="min-h-10 px-2 text-xs text-muted underline">ล้างทั้งหมด</button>
              </div>
              <ul className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <li key={r} className="inline-flex items-center overflow-hidden rounded-full border border-line bg-surface">
                    <button type="button" onClick={() => setQuery(r)} className="min-h-10 pl-4 pr-2 text-sm">{r}</button>
                    <button type="button" aria-label={`ลบ ${r} ออกจากประวัติ`} onClick={() => { const n = removeRecent(recent, r); setRecent(n); saveRecent(n); }}
                      className="flex h-10 w-9 items-center justify-center text-muted"><X size={14} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h2 className="mb-2 text-sm font-semibold">ลองค้นหา</h2>
            <ul className="flex flex-wrap gap-2">
              {EXAMPLES.map((x) => (
                <li key={x}><button type="button" onClick={() => setQuery(x)} className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm">{x}</button></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">พิมพ์ได้หลายคำ เช่น “ชลบุรี วัด” ระบบจะหาสถานที่ที่ตรงทุกคำ · ค้นจากชื่อสถานที่ จังหวัด อำเภอ และหมวดหมู่</p>
          </div>
        </section>
      )}

      {status === 'short' && <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm text-muted">พิมพ์อย่างน้อย {MIN_QUERY_CHARS} ตัวอักษร</p>}
      {clean.truncated && status !== 'idle' && <p className="text-xs text-muted">ใช้เฉพาะ 5 คำแรก / 80 ตัวอักษรแรกในการค้นหา</p>}

      {status === 'loading' && (
        <div className="space-y-2" aria-busy="true" aria-live="polite"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      )}

      {status === 'error' && (
        <EmptyState icon={<TriangleAlert size={36} />} title={error ?? 'ค้นหาไม่สำเร็จ'}
          action={<Button onClick={() => setRetry((n) => n + 1)}>ลองใหม่</Button>} />
      )}

      {status === 'ok' && result && (
        <>
          {provinceMatches.length > 0 && url.page === 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">ดูทั้งจังหวัด:</span>
              {provinceMatches.map((p) => (
                <Link key={p.id} to={`/province/${p.slug}`} className="inline-flex min-h-10 items-center rounded-full border border-primary px-4 text-primary">{p.name_th}</Link>
              ))}
            </div>
          )}

          {result.total === 0 ? (
            <EmptyState icon={<SearchX size={36} />}
              title={beyond ? 'ไม่มีผลลัพธ์ในหน้านี้' : `ไม่พบ “${clean.q}”`}
              text={beyond ? undefined : filtered ? 'ลองล้างตัวกรอง หรือลดจำนวนคำค้น' : 'ลองลดจำนวนคำ หรือลองคำที่สั้นลง เช่น ชื่อจังหวัดอย่างเดียว'}
              action={beyond ? <Button onClick={() => goPage(1)}>กลับหน้าแรกของผลลัพธ์</Button> : filtered ? <Button variant="secondary" onClick={resetFilters}>ล้างตัวกรอง</Button> : undefined} />
          ) : (
            <section aria-label="ผลการค้นหา" className="space-y-3">
              <p role="status" className="text-sm text-muted">พบ {result.total.toLocaleString('th-TH')} แห่ง · {rangeText(url.page, result.total)}</p>
              <ul className="space-y-3">
                {hits.map((h) => {
                  const cat = catById.get(h.category_id);
                  const province = provName.get(h.province_id);
                  return (
                    <li key={h.id}>
                      <Link to={`/place/${h.id}`} className="flex gap-3 rounded-2xl border border-line bg-surface p-3 hover:bg-surface-2">
                        <div className="w-24 shrink-0 self-start sm:w-32">
                          <PlaceImageView image={covers.get(h.id) ?? null} placeName={h.name_th} seed={h.id} color={cat?.color} icon={cat?.icon} ratio="4/3" className="rounded-xl" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="font-semibold leading-snug"><Highlight text={h.name_th} tokens={clean.tokens} /></h2>
                          {h.name_en && <p className="truncate text-xs text-muted"><Highlight text={h.name_en} tokens={clean.tokens} /></p>}
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-muted">
                            <span className="inline-flex items-center gap-1" style={{ color: cat?.color }}><CategoryIcon name={cat?.icon} size={13} /></span>
                            <span><Highlight text={cat?.name_th ?? 'ไม่ระบุหมวด'} tokens={clean.tokens} /></span>
                            {h.district_name && <span>· <Highlight text={h.district_name} tokens={clean.tokens} /></span>}
                            {province && <span>· <Highlight text={province} tokens={clean.tokens} /></span>}
                          </p>
                          {h.short_description && <p className="mt-1 line-clamp-1 text-sm">{h.short_description}</p>}
                          <div className="mt-1"><VerificationBadge place={h} small /></div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {pages > 1 && (
                <nav aria-label="แบ่งหน้า" className="flex items-center justify-between gap-2 pt-1">
                  <Button variant="secondary" disabled={url.page <= 1} icon={<ChevronLeft size={18} />} onClick={() => goPage(url.page - 1)}>ก่อนหน้า</Button>
                  <span className="text-sm text-muted" aria-live="polite">หน้า {url.page}/{pages}</span>
                  <Button variant="secondary" disabled={url.page >= pages} onClick={() => goPage(url.page + 1)}>ถัดไป <ChevronRight size={18} /></Button>
                </nav>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
