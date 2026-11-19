import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { FeatureCollection, Geometry } from 'geojson';
import {
  ArrowLeft, ChevronRight, Crosshair, LocateFixed, MapPin, MapPinPlus, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Route,
} from 'lucide-react';
import { GeoMap, type MapPoint } from '../features/map/GeoMap';
import { geometryArea } from '../features/map/labelPoint';
import { loadProvinceShapes, type ProvinceGeoProps } from '../features/map/geoLoader';
import { locatePoint } from '../features/map/locate';
import { primaryColor, statusColor } from '../features/map/colors';
import { statusOf, useReference } from '../features/provinces/useGeoData';
import { useProvinceStatsWithGuest as useProvinceStats } from '../features/guest/useStatsWithGuest';
import { regionColor } from '../features/covers/regionColors';
import { useAuth } from '../features/auth/AuthProvider';
import { useCart } from '../features/cart/CartProvider';
import { useWantList } from '../features/explore/useWantList';
import { ExplorePanel } from '../features/explore/ExplorePanel';
import {
  crumbs, pickLabelHolders, provinceRegionMap, provinceRows, regionCards, searchProvinces,
} from '../features/explore/exploreModel';
import { shortRegionLabel } from '../features/explore/labels';
import { normalizePoint, type LatLng } from '../features/explore/pin';
import type { Snap } from '../features/explore/sheetSnap';
import { listMyPlaces, type UserPlace } from '../features/myplaces/userPlacesApi';
import { PinPlaceSheet } from '../features/myplaces/PinPlaceSheet';
import type { Place } from '../features/places/types';
import { BottomSheet3 } from '../components/ui/BottomSheet3';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useDebounce } from '../hooks/useDebounce';
import { escapeHtml } from '../lib/escapeHtml';

const PANEL_KEY = 'thai77.explore.panel';
const readPanel = () => { try { return localStorage.getItem(PANEL_KEY) !== '0'; } catch { return true; } };
const MY_PIN_COLOR = '#9333EA';

type Selected = { region: string | null; pcode: string } | null;

export function ExplorePage() {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const cart = useCart();
  const want = useWantList();
  const [params, setParams] = useSearchParams();
  const { regions, provinces, error: refError, loading } = useReference();
  const stats = useProvinceStats();

  const [shapes, setShapes] = useState<FeatureCollection<Geometry, ProvinceGeoProps> | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [snap, setSnap] = useState<Snap>('half');
  const [panelOpen, setPanelOpen] = useState(readPanel);
  const [full, setFull] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState('');
  const q = useDebounce(query, 250);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapH, setWrapH] = useState(560);

  // pin-drop ("ปักหมุดเอง")
  const [pinMode, setPinMode] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [pinSheet, setPinSheet] = useState(false);
  const savedSnap = useRef<Snap>('half');
  const [mine, setMine] = useState<UserPlace[]>([]);

  useEffect(() => { loadProvinceShapes().then(setShapes).catch((e: Error) => setGeoError(e.message)); }, []);
  useEffect(() => { try { localStorage.setItem(PANEL_KEY, panelOpen ? '1' : '0'); } catch { /* private mode */ } }, [panelOpen]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWrapH(el.clientHeight);
    const ro = new ResizeObserver(() => setWrapH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [full]);

  // my personal places are drawn as purple dots
  const uid = user?.id ?? null;
  useEffect(() => {
    if (!uid) { setMine([]); return; }
    let alive = true;
    listMyPlaces(uid).then((d) => { if (alive) setMine(d); }).catch(() => { if (alive) setMine([]); });
    return () => { alive = false; };
  }, [uid]);
  const myPoints = useMemo<MapPoint[]>(
    () => mine.filter((p) => p.lat != null && p.lng != null).map((p) => ({ id: p.id, lat: p.lat as number, lng: p.lng as number, color: MY_PIN_COLOR, title: p.name_th })),
    [mine],
  );

  // ---------- level (from the URL: #/explore?region=east) ----------
  const regionParam = params.get('region');
  const region = regions.find((r) => r.code === regionParam) ?? null;
  const level: 1 | 2 = region ? 2 : 1;
  const regionCode = region?.code ?? null;

  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const provByPcode = useMemo(() => new Map(provinces.map((p) => [p.pcode, p])), [provinces]);
  const pcodeRegion = useMemo(() => provinceRegionMap(provinces, regions), [provinces, regions]);
  const regionName = (code: string | undefined) => regions.find((r) => r.code === code)?.name_th ?? '';

  const labelHolders = useMemo(
    () => (shapes
      ? pickLabelHolders(shapes.features.map((f) => ({ pcode: f.properties.pcode, region: pcodeRegion.get(f.properties.pcode), area: geometryArea(f.geometry) })))
      : new Set<string>()),
    [shapes, pcodeRegion],
  );
  const cards = useMemo(() => regionCards(regions, provinces, stats), [regions, provinces, stats]);
  const card = cards.find((c) => c.code === regionCode) ?? null;
  const rows = useMemo(() => (region ? provinceRows(region.id, provinces, stats, (s) => statusOf(s)) : []), [region, provinces, stats]);
  const fitIds = useMemo(() => (region ? provinces.filter((p) => p.region_id === region.id).map((p) => p.pcode) : null), [region, provinces]);

  const selectedPcode = selected && selected.region === regionCode ? selected.pcode : null;
  const selectedProv = selectedPcode ? provByPcode.get(selectedPcode) : undefined;

  const results = useMemo(
    () => searchProvinces(provinces, q, 8).map((p) => ({ pcode: p.pcode, name: p.name_th, regionName: regionById.get(p.region_id)?.name_th ?? '' })),
    [provinces, q, regionById],
  );

  // ---------- actions ----------
  const enterRegion = (code: string, pcode?: string) => {
    setParams({ region: code });
    setSelected(pcode ? { region: code, pcode } : null);
    setSnap((s) => (s === 'hidden' ? 'half' : s));
  };
  const leaveRegion = () => { setParams({}); setSelected(null); };
  const pickProvince = (pcode: string) => {
    const code = pcodeRegion.get(pcode);
    if (!code) return;
    if (code !== regionCode) enterRegion(code, pcode);
    else setSelected({ region: code, pcode });
  };
  const openProvince = (slug: string) => nav(`/province/${slug}`);
  const onMapSelect = (id: string) => (level === 1 ? enterRegion(id) : pickProvince(id));
  const onMapOpen = (id: string) => { const p = provByPcode.get(id); if (level === 2 && p) openProvince(p.slug); };

  const locate = () => {
    if (!navigator.geolocation) { toast('อุปกรณ์นี้หาตำแหน่งไม่ได้', 'error'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setMe({ lat, lng });
        const r = await locatePoint(lat, lng);
        setLocating(false);
        const p = r ? provByPcode.get(r.provincePcode) : undefined;
        const code = p ? regionById.get(p.region_id)?.code : undefined;
        if (!p || !code) { toast('ตำแหน่งของคุณอยู่นอกประเทศไทย', 'info'); return; }
        enterRegion(code, p.pcode);
        toast(`คุณอยู่ที่ ${p.name_th}`, 'success');
      },
      () => { setLocating(false); toast('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง', 'error'); },
      { timeout: 10000, maximumAge: 300000 },
    );
  };

  // ---------- pin-drop ----------
  const startPin = () => {
    if (!user) { toast('เข้าสู่ระบบก่อนปักหมุด', 'info'); nav('/auth/login'); return; }
    savedSnap.current = snap;
    setSnap('hidden'); // get the sheet out of the way of the map
    setPin(null);
    setPinMode(true);
  };
  const cancelPin = () => { setPinMode(false); setPin(null); setPinSheet(false); setSnap(savedSnap.current); };
  const onMapClick = (lat: number, lng: number) => {
    const p = normalizePoint(lat, lng);
    if (!p) return;
    setPin(p);
    setPinSheet(true);
  };
  const onPinSaved = (place: UserPlace) => {
    setMine((xs) => [place, ...xs]);
    setPinMode(false);
    setPin(null);
    setSnap(savedSnap.current);
    toast(`เพิ่ม “${place.name_th}” แล้ว`, 'success');
  };
  useEffect(() => {
    if (!pinMode || pinSheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelPin(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // cancelPin only uses setters and a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinMode, pinSheet]);

  const planIds = useMemo(() => new Set([...want.items.map((w) => w.id), ...cart.items.map((c) => c.id)]), [want.items, cart.items]);
  const planTrip = () => {
    want.items.forEach((w) => cart.add(w as Place));
    nav('/cart');
  };
  const removeWant = (id: string) => { want.remove(id).catch(() => toast('เอาออกไม่สำเร็จ ลองใหม่', 'error')); };

  const steps = crumbs(level, region?.name_th, selectedProv?.name_th);
  const mapBtn = 'pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-md hover:bg-surface-2 disabled:opacity-60';

  return (
    <div
      ref={wrapRef}
      className={full
        ? 'fixed inset-0 z-[900] bg-bg lg:flex'
        : 'relative h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-bottom))] overflow-hidden lg:flex lg:h-[calc(100dvh-3.5rem)]'}
    >
      {/* ---------- map (lg:relative keeps the overlay buttons inside the map, not over the side panel) ---------- */}
      <div className="absolute inset-0 lg:relative lg:h-full lg:min-w-0 lg:flex-1">
        {geoError ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState icon={<MapPin size={40} />} title="ยังไม่มีไฟล์แผนที่" text="ไปที่ GitHub → Actions → Build Geo Data → Run workflow แล้วรอ Deploy ใหม่" />
          </div>
        ) : !shapes || loading ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : (
          <GeoMap<ProvinceGeoProps>
            data={shapes}
            tiles={false}
            bare
            zoomPosition="topright"
            className="h-full"
            getId={(g) => (level === 1 ? pcodeRegion.get(g.pcode) ?? g.pcode : g.pcode)}
            selectedId={level === 2 ? selectedPcode : null}
            fitIds={fitIds}
            userLocation={me}
            points={myPoints}
            onPointClick={() => nav('/my-places')}
            pinMode={pinMode}
            onMapClick={onMapClick}
            pin={pin}
            onSelect={onMapSelect}
            onOpen={onMapOpen}
            getLabel={(g) => {
              if (level === 1) return labelHolders.has(g.pcode) ? shortRegionLabel(regionName(pcodeRegion.get(g.pcode))) : null;
              return pcodeRegion.get(g.pcode) === regionCode ? g.name_th : null;
            }}
            getTooltip={(g) => `<b>${escapeHtml(g.name_th)}</b><br/>${escapeHtml(regionName(pcodeRegion.get(g.pcode)))}`}
            getStyle={(g, isSel) => {
              const code = pcodeRegion.get(g.pcode);
              if (level === 1) return { fillColor: regionColor(code), fillOpacity: 0.85, color: '#ffffff', weight: 1, opacity: 1 };
              const inRegion = code === regionCode;
              const p = provByPcode.get(g.pcode);
              return {
                fillColor: inRegion ? statusColor(statusOf(p ? stats[p.id] : undefined)) : regionColor(code),
                fillOpacity: inRegion ? 0.85 : 0.14,
                color: isSel ? primaryColor() : '#ffffff',
                weight: isSel ? 3 : 1,
                opacity: inRegion ? 1 : 0.4,
              };
            }}
          />
        )}

        {/* overlays: back button, status bar, map buttons */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {level === 2 && !pinMode && (
            <button type="button" aria-label="กลับไปเลือกภาค" onClick={leaveRegion} className={`${mapBtn} absolute left-2 top-2`}>
              <ArrowLeft size={22} />
            </button>
          )}
          {pinMode ? (
            <div role="status" aria-live="polite"
              className="pointer-events-auto absolute left-2 right-14 top-2 flex min-h-12 items-center gap-2 overflow-hidden rounded-full bg-primary px-4 text-sm font-medium text-on-primary shadow-md">
              <Crosshair size={18} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">แตะแผนที่ตรงที่ตั้งสถานที่</span>
              <button type="button" onClick={cancelPin} className="min-h-10 shrink-0 rounded-full px-3 underline">ยกเลิก</button>
            </div>
          ) : (
            <div role="status" aria-live="polite"
              className={`pointer-events-auto absolute right-14 top-2 flex min-h-12 items-center gap-1 overflow-hidden rounded-full bg-surface/95 px-4 text-sm shadow-md backdrop-blur ${level === 2 ? 'left-16' : 'left-2'}`}>
              {steps.map((s, i) => (
                <span key={`${s.text}-${i}`} className="flex min-w-0 items-center gap-1">
                  {i > 0 && <ChevronRight size={14} className="shrink-0 text-muted" />}
                  <span className={`truncate ${s.state === 'now' ? 'font-semibold text-fg' : 'text-muted'}`}>{s.text}</span>
                </span>
              ))}
            </div>
          )}
          <div className="absolute left-2 top-16 flex flex-col items-start gap-2">
            <button type="button" aria-label="ตำแหน่งของฉัน" disabled={locating} onClick={locate} className={mapBtn}>
              <LocateFixed size={22} className={locating ? 'animate-pulse text-primary' : ''} />
            </button>
            <button type="button" aria-label={full ? 'ออกจากเต็มจอ' : 'แผนที่เต็มจอ'} onClick={() => setFull((v) => !v)} className={mapBtn}>
              {full ? <Minimize2 size={22} /> : <Maximize2 size={22} />}
            </button>
            <button type="button" aria-pressed={pinMode} onClick={pinMode ? cancelPin : startPin}
              className={`pointer-events-auto flex min-h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium shadow-md ${pinMode ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-fg hover:bg-surface-2'}`}>
              <MapPinPlus size={20} /> ปักหมุดเอง
            </button>
            {!full && !panelOpen && (
              <button type="button" aria-label="แสดงแผง" onClick={() => setPanelOpen(true)} className={`${mapBtn} max-lg:hidden`}>
                <PanelRightOpen size={22} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------- sheet (phone) / side panel (desktop) ---------- */}
      {!full && (
        <BottomSheet3
          snap={snap}
          onSnapChange={setSnap}
          containerHeight={wrapH}
          label="แผงข้อมูลสำรวจ"
          title={level === 1 ? 'เลือกภาค' : card?.name ?? 'ภาค'}
          subtitle={level === 1 ? `${cards.length || 6} ภาค · ${provinces.length || 77} จังหวัด` : `${card?.provinceCount ?? 0} จังหวัด`}
          className={`absolute inset-x-0 bottom-0 z-20 lg:static lg:inset-auto lg:z-auto lg:w-[360px] lg:shrink-0 lg:border-l lg:border-t-0 ${panelOpen ? '' : 'lg:hidden'}`}
          footer={
            <div>
              <Button className="w-full" icon={<Route size={20} />} disabled={planIds.size === 0} onClick={planTrip}>
                จัดทริป{planIds.size ? ` (${planIds.size})` : ''}
              </Button>
              {planIds.size === 0 && <p className="mt-1 text-center text-xs text-muted">เลือกสถานที่ที่อยากไปก่อน แล้วกลับมาจัดทริป</p>}
            </div>
          }
        >
          {refError ? (
            <p className="pt-3 text-sm text-red-600">{refError}</p>
          ) : (
            <>
              <button type="button" onClick={() => setPanelOpen(false)} aria-label="ซ่อนแผง"
                className="ml-auto mt-1 hidden min-h-10 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 lg:flex">
                <PanelRightClose size={18} /> ซ่อนแผง
              </button>
              <ExplorePanel
                level={level}
                hasData={provinces.length > 0 || loading}
                cards={cards}
                card={card}
                rows={rows}
                selectedPcode={selectedPcode}
                query={query}
                onQuery={setQuery}
                results={results}
                onPickRegion={enterRegion}
                onPickProvince={pickProvince}
                onOpenProvince={openProvince}
                onPickResult={(pcode) => { setQuery(''); pickProvince(pcode); }}
                want={{ items: want.items, loading: want.loading, error: want.error, signedIn: want.signedIn }}
                provinceName={(id) => provinces.find((p) => p.id === id)?.name_th ?? ''}
                inCart={(id) => cart.has(id)}
                onRemoveWant={removeWant}
              />
            </>
          )}
        </BottomSheet3>
      )}

      <PinPlaceSheet open={pinSheet} point={pin} userId={uid ?? ''} onClose={() => { setPinSheet(false); setPin(null); }} onSaved={onPinSaved} />
    </div>
  );
}
