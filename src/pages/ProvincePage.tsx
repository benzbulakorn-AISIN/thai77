import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FeatureCollection, Geometry } from 'geojson';
import { ArrowLeft, CalendarDays, Landmark, MapPin, MapPinned } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { escapeHtml } from '../lib/escapeHtml';
import { GeoMap, type MapPoint } from '../features/map/GeoMap';
import { loadDistrictShapes, type DistrictGeoProps } from '../features/map/geoLoader';
import { primaryColor } from '../features/map/colors';
import { useReference, type District } from '../features/provinces/useGeoData';
import { fetchCategories, fetchPlacesByProvince } from '../features/places/placesApi';
import { fetchPublishedLandmarksByProvince, type PublishedProvinceLandmark } from '../features/places/landmarksApi';
import { useMyPlaces } from '../features/places/useMyPlaces';
import { PlaceList } from '../features/places/PlaceList';
import { ImageCredit, PlaceImageView } from '../features/placeImages/PlaceImage';
import { usePlaceCovers } from '../features/placeImages/usePlaceCovers';
import type { Category, Place } from '../features/places/types';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';

const PALETTE = ['#DBEAFE', '#DCFCE7', '#FEF9C3', '#FFEDD5', '#EDE9FE', '#FCE7F3', '#CCFBF1', '#ECFCCB'];

export function ProvincePage() {
  const { slug } = useParams();
  const { provinces, regions, loading } = useReference();
  const province = provinces.find((p) => p.slug === slug);
  const region = regions.find((r) => r.id === province?.region_id);
  const my = useMyPlaces();

  const [districts, setDistricts] = useState<District[] | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [landmarks, setLandmarks] = useState<PublishedProvinceLandmark[]>([]);
  const [shapes, setShapes] = useState<FeatureCollection<Geometry, DistrictGeoProps> | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // district pcode
  const [highlight, setHighlight] = useState<string | null>(null); // place id

  useEffect(() => { fetchCategories().then(setCategories).catch(() => setCategories([])); }, []);

  useEffect(() => {
    if (!province) return;
    let alive = true;
    setDistricts(null); setShapes(null); setGeoError(false); setSelected(null); setPlaces(null); setPlacesError(null); setLandmarks([]);
    supabase.from('districts').select('id,pcode,name_th,name_en').eq('province_id', province.id).order('name_th')
      .then(({ data }) => alive && setDistricts((data ?? []) as District[]));
    fetchPlacesByProvince(province.id)
      .then((d) => alive && setPlaces(d))
      .catch((e: Error) => alive && setPlacesError(e.message));
    fetchPublishedLandmarksByProvince(province.id)
      .then((d) => alive && setLandmarks(d))
      .catch(() => alive && setLandmarks([]));
    loadDistrictShapes(province.pcode).then((d) => alive && setShapes(d)).catch(() => alive && setGeoError(true));
    return () => { alive = false; };
  }, [province]);

  const colorIdx = useMemo(() => {
    const m = new Map<string, number>();
    shapes?.features.forEach((f, i) => m.set(f.properties.pcode, i % PALETTE.length));
    return m;
  }, [shapes]);
  const districtByPcode = useMemo(() => new Map((districts ?? []).map((d) => [d.pcode, d])), [districts]);
  const districtNames = useMemo(() => new Map((districts ?? []).map((d) => [d.id, d.name_th])), [districts]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (places ?? []).forEach((p) => { if (p.district_id) c[p.district_id] = (c[p.district_id] ?? 0) + 1; });
    return c;
  }, [places]);
  const landmarkCovers = usePlaceCovers(landmarks.map((item) => ({
    id: item.place_id,
    nameTh: item.name_th,
    nameEn: item.name_en,
    provinceTh: province?.name_th,
    provinceEn: province?.name_en,
  })));

  const selectedDistrictId = selected ? districtByPcode.get(selected)?.id ?? null : null;
  const points: MapPoint[] = useMemo(() => (places ?? [])
    .filter((p) => p.lat != null && p.lng != null && (!selectedDistrictId || p.district_id === selectedDistrictId))
    .map((p) => ({
      id: p.id, lat: p.lat as number, lng: p.lng as number, title: p.name_th,
      color: catById.get(p.category_id)?.color ?? '#64748B', highlight: p.id === highlight,
    })), [places, selectedDistrictId, catById, highlight]);

  if (loading) return <Skeleton className="h-96" />;
  if (!province) {
    return (
      <EmptyState icon={<MapPinned size={40} />} title="ไม่พบจังหวัดนี้"
        action={<Link to="/" className="text-primary underline">กลับหน้าแรก</Link>} />
    );
  }

  const toggle = (pcode: string) => setSelected((cur) => (cur === pcode ? null : pcode));
  const focusPlace = (id: string) => {
    setHighlight(id);
    document.getElementById(`place-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

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

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="flex items-center gap-1 text-xs text-muted"><CalendarDays size={14} /> ช่วงที่เหมาะ</p>
          <p className="font-semibold">{province.best_season ?? 'รอข้อมูล'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="flex items-center gap-1 text-xs text-muted"><Landmark size={14} /> อำเภอ</p>
          <p className="font-semibold">{districts ? districts.length : '…'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="flex items-center gap-1 text-xs text-muted"><MapPin size={14} /> สถานที่</p>
          <p className="font-semibold">{places ? places.length : '…'}</p>
        </div>
      </section>
      {province.summary && <p className="text-sm">{province.summary}</p>}

      {landmarks.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-line bg-surface p-3 sm:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-1">
            <h2 className="flex items-center gap-2 font-semibold"><Landmark size={18} /> Landmark ประจำจังหวัด</h2>
            <p className="text-[11px] text-muted">รูปที่ Admin ตรวจสอบแล้วจากฐานข้อมูล</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {landmarks.map((item) => {
              const cover = landmarkCovers.get(item.place_id) ?? null;
              return (
                <article key={item.id} className="overflow-hidden rounded-xl border border-line bg-surface-2">
                  <div className="relative">
                    <Link to={`/place/${item.place_id}`} tabIndex={-1} aria-hidden="true" className="block">
                      <PlaceImageView image={cover} placeName={item.name_th} seed={item.place_id} ratio="4/3" rounded={false} />
                    </Link>
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white">#{item.rank}</span>
                  </div>
                  {cover && <ImageCredit image={cover} className="line-clamp-1 px-2 pt-1 text-[9px]" />}
                  <div className="p-2">
                    <Link to={`/place/${item.place_id}`} className="line-clamp-2 text-sm font-semibold leading-snug underline">{item.name_th}</Link>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{item.landmark_reason_th}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {geoError ? (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">ยังไม่มีไฟล์ขอบเขตอำเภอของจังหวัดนี้</p>
      ) : !shapes ? (
        <Skeleton className="h-[55vh] min-h-[320px]" />
      ) : (
        <GeoMap<DistrictGeoProps>
          data={shapes}
          className="faded-tiles h-[55vh] min-h-[320px] max-h-[640px]"
          getId={(p) => p.pcode}
          selectedId={selected}
          onSelect={toggle}
          onOpen={toggle}
          points={points}
          onPointClick={focusPlace}
          getLabel={(p) => p.name_th}
          getTooltip={(p) => `<b>${escapeHtml(p.name_th)}</b>`}
          getStyle={(p, isSel) => ({
            fillColor: PALETTE[colorIdx.get(p.pcode) ?? 0],
            fillOpacity: selected && !isSel ? 0.3 : 0.75,
            color: isSel ? primaryColor() : '#334155',
            weight: isSel ? 3.5 : 1,
          })}
        />
      )}

      <section>
        <h2 className="mb-2 font-semibold">อำเภอ <span className="text-xs font-normal text-muted">แตะเพื่อกรองสถานที่</span></h2>
        {!districts ? (
          <Skeleton className="h-24" />
        ) : districts.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีรายชื่ออำเภอ — รัน supabase/seed_geo.sql</p>
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {districts.map((d) => (
              <button key={d.id} type="button" onClick={() => toggle(d.pcode)}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm
                  ${selected === d.pcode ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>
                {d.name_th}
                <span className="rounded-full bg-black/10 px-2 text-xs">{counts[d.id] ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {placesError ? (
        <p className="text-sm text-red-600">{placesError}</p>
      ) : !places ? (
        <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : (
        <PlaceList places={places} categories={categories} districtNames={districtNames}
          provinceNameTh={province.name_th} provinceNameEn={province.name_en}
          districtFilter={selectedDistrictId} onClearDistrict={() => setSelected(null)}
          my={my} highlightId={highlight} />
      )}
    </div>
  );
}
