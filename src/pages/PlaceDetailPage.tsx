import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Accessibility, Baby, Banknote, CalendarX, Camera, Car, ChevronRight, Clock, ExternalLink, Globe, ImagePlus, Info,
  Map as MapIcon, MapPin, Phone, Timer,
} from 'lucide-react';
import { fetchCategories, fetchPlace } from '../features/places/placesApi';
import { useMyPlaces } from '../features/places/useMyPlaces';
import { CategoryIcon } from '../features/places/categoryIcons';
import { VerificationBadge } from '../features/places/VerificationBadge';
import { StatusControl } from '../features/places/StatusControl';
import { CartButton } from '../features/cart/CartButton';
import { formatOpeningHoursTh } from '../features/routing/openingHours';
import { fmtDateTh } from '../features/routing/time';
import { useReference } from '../features/provinces/useGeoData';
import { useAuth } from '../features/auth/AuthProvider';
import { listVisitsForPlace, type Visit } from '../features/memories/memoriesApi';
import { VisitSheet } from '../features/memories/VisitSheet';
import { Stars } from '../features/memories/StarRating';
import { orderWithCoverFirst, type PlaceImage } from '../features/placeImages/imageModel';
import { fetchPlaceImageSet } from '../features/placeImages/placeImagesApi';
import { ImageCredit, PlaceThumb } from '../features/placeImages/PlaceImage';
import { PlaceHero } from '../features/placeImages/PlaceHero';
import { supabase } from '../lib/supabase';
import type { Category, Place, PlaceSource } from '../features/places/types';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';

type Facilities = {
  has_toilet: boolean | null; has_parking: boolean | null; elderly_friendly: boolean | null;
  wheelchair: boolean | null; kid_friendly: boolean | null; pet_friendly: boolean | null;
};

const PENDING = <span className="text-muted">รอตรวจสอบ</span>;
const baht = (n: number | null) => (n == null ? PENDING : n === 0 ? 'ฟรี' : `฿${n.toLocaleString('th-TH')}`);
const yesNo = (v: boolean | null | undefined) => (v == null ? '—' : v ? '✓ มี' : '✗ ไม่มี');
const SOURCE_TYPE: Record<string, string> = {
  tat: 'ททท.', province: 'เว็บไซต์จังหวัด', national_park: 'กรมอุทยานฯ', local_gov: 'หน่วยงานท้องถิ่น',
  official_social: 'เพจทางการ', osm: 'OpenStreetMap', other: 'อื่น ๆ',
};
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <div className="break-words text-sm">{children}</div>
      </div>
    </div>
  );
}

export function PlaceDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const my = useMyPlaces();
  const { provinces } = useReference();
  const [data, setData] = useState<{ place: Place; sources: PlaceSource[] } | null | undefined>(undefined);
  const [cat, setCat] = useState<Category | undefined>();
  const [district, setDistrict] = useState<string | null>(null);
  const [fac, setFac] = useState<Facilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitOpen, setVisitOpen] = useState(false);
  const [images, setImages] = useState<PlaceImage[]>([]);
  const [active, setActive] = useState(0);

  const loadVisits = useCallback(() => {
    if (!id || !user) { setVisits([]); return; }
    listVisitsForPlace(id).then(setVisits).catch(() => setVisits([]));
  }, [id, user]);
  useEffect(() => { loadVisits(); }, [loadVisits]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setData(undefined); setImages([]); setActive(0);
    fetchPlace(id).then(async (d) => {
      if (!alive) return;
      setData(d);
      if (!d) return;
      // pictures are optional: if loading fails the generated cover is shown
      fetchPlaceImageSet(d.place.id)
        .then((s) => { if (alive) setImages(orderWithCoverFirst(s.images, s.coverId)); })
        .catch(() => undefined);
      const cats = await fetchCategories();
      if (alive) setCat(cats.find((c) => c.id === d.place.category_id));
      if (d.place.district_id) {
        const r = await supabase.from('districts').select('name_th').eq('id', d.place.district_id).maybeSingle();
        if (alive) setDistrict((r.data as { name_th: string } | null)?.name_th ?? null);
      }
      const f = await supabase.from('place_facilities')
        .select('has_toilet,has_parking,elderly_friendly,wheelchair,kid_friendly,pet_friendly').eq('place_id', d.place.id).maybeSingle();
      if (alive) setFac((f.data as Facilities | null) ?? null);
    }).catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (data === undefined) return <div className="space-y-3"><Skeleton className="h-56" /><Skeleton className="h-64" /></div>;
  if (data === null) {
    return <EmptyState icon={<MapPin size={40} />} title="ไม่พบสถานที่นี้" action={<Link to="/" className="text-primary underline">กลับหน้าแรก</Link>} />;
  }

  const { place: p, sources } = data;
  const province = provinces.find((x) => x.id === p.province_id);
  const hasCoords = p.lat != null && p.lng != null;
  const gmaps = p.google_maps_url ?? (hasCoords ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : null);
  const osm = hasCoords ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}` : null;
  const state = my.get(p.id);
  const hours = formatOpeningHoursTh(p.opening_hours_text);
  const current = images[Math.min(active, images.length - 1)] ?? null;
  const goBack = () => (window.history.length > 1 ? nav(-1) : nav(province ? `/province/${province.slug}` : '/'));

  return (
    <div className="space-y-4">
      <PlaceHero
        image={current} placeName={p.name_th} subtitle={p.name_en ?? undefined} seed={p.id}
        color={cat?.color} icon={cat?.icon} onBack={goBack}
        actions={isAdmin && (
          <Link to={`/admin/places/${p.id}/images`} aria-label="จัดการรูป"
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-black/50 px-4 text-sm text-white backdrop-blur hover:bg-black/65">
            <ImagePlus size={18} /> จัดการรูป
          </Link>
        )}
      />
      {images.length > 1 && (
        <div className="-mt-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="รูปทั้งหมด">
          {images.map((im, i) => (
            <button key={im.id} type="button" aria-label={`ดูรูปที่ ${i + 1}`} aria-pressed={i === active} onClick={() => setActive(i)}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${i === active ? 'border-primary' : 'border-transparent opacity-80'}`}>
              <PlaceThumb image={im} />
            </button>
          ))}
        </div>
      )}
      <ImageCredit image={current} className="-mt-2" />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1" style={{ color: cat?.color }}><CategoryIcon name={cat?.icon} size={16} /> <span className="text-fg">{cat?.name_th}</span></span>
        {district && <span>· {district}</span>}
        {province && <span>· <Link to={`/province/${province.slug}`} className="text-primary underline">{province.name_th}</Link></span>}
      </div>

      <VerificationBadge place={p} />
      {p.state !== 'active' && (
        <p className="rounded-xl bg-red-100 p-3 text-sm text-red-800">
          {p.state === 'permanently_closed' ? 'ปิดถาวร' : p.state === 'temporarily_closed' ? 'ปิดชั่วคราว' : 'เปิดเฉพาะบางฤดู'}
        </p>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <StatusControl state={state} signedIn={my.signedIn}
            onStatus={(s) => my.setStatus(p.id, s)} onFavorite={() => my.toggleFavorite(p.id)} />
        </div>
        <CartButton place={p} />
      </div>

      {/* my visits */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">การไปของฉัน {visits.length > 0 && <span className="text-sm font-normal text-muted">({visits.length} ครั้ง)</span>}</h2>
          <Button variant="secondary" className="min-h-10 text-sm" icon={<Camera size={16} />}
            onClick={() => (user ? setVisitOpen(true) : nav('/auth/login'))}>
            บันทึกการไป
          </Button>
        </div>
        {visits.length === 0 ? (
          <p className="mt-2 text-sm text-muted">ไปมาแล้ว? บันทึกวันที่ รูป และความประทับใจไว้ได้เลย</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {visits.map((v) => (
              <li key={v.id}>
                <Link to={`/memories/${v.id}`} className="flex min-h-11 items-center gap-2 py-1 text-sm">
                  <span className="flex-1">{fmtDateTh(v.visited_on, true)}</span>
                  <Stars value={v.rating} />
                  <ChevronRight size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.short_description && <p>{p.short_description}</p>}
      {p.highlights.length > 0 && (
        <ul className="list-inside list-disc text-sm">{p.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
      )}

      <section className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
        <Row icon={<Clock size={18} />} label="เวลาเปิด-ปิด">{hours ?? PENDING}</Row>
        <Row icon={<CalendarX size={18} />} label="วันหยุด">{p.closed_days_text ?? PENDING}</Row>
        <Row icon={<Banknote size={18} />} label="ค่าเข้าชม">
          คนไทย {baht(p.fee_thai)} · ต่างชาติ {baht(p.fee_foreigner)}
        </Row>
        <Row icon={<Car size={18} />} label="ค่าจอดรถ">{baht(p.parking_fee)}</Row>
        <Row icon={<Banknote size={18} />} label="ค่าใช้จ่ายโดยประมาณ/คน">{baht(p.est_cost_per_person)}</Row>
        <Row icon={<Timer size={18} />} label="เวลาที่ควรใช้">{p.suggested_minutes != null ? `~${p.suggested_minutes} นาที` : PENDING}</Row>
        <Row icon={<Info size={18} />} label="ช่วงเวลา/ฤดูที่แนะนำ">
          {[p.best_time_of_day, p.best_months.length ? p.best_months.map((m) => MONTHS[m - 1]).join(' ') : null].filter(Boolean).join(' · ') || PENDING}
        </Row>
        <Row icon={<MapPin size={18} />} label="ที่อยู่">{p.address ?? PENDING}</Row>
        {p.phone && <Row icon={<Phone size={18} />} label="โทร"><a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="text-primary underline">{p.phone}</a></Row>}
        {(p.website_url || p.social_url) && (
          <Row icon={<Globe size={18} />} label="เว็บไซต์ / Social">
            {[p.website_url, p.social_url].filter(Boolean).map((u) => (
              <a key={u} href={u as string} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-primary underline">{u}</a>
            ))}
          </Row>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><Accessibility size={18} /> สิ่งอำนวยความสะดวก</h2>
        {fac ? (
          <div className="grid grid-cols-2 gap-1 text-sm">
            <span>ห้องน้ำ: {yesNo(fac.has_toilet)}</span>
            <span>ที่จอดรถ: {yesNo(fac.has_parking)}</span>
            <span>ผู้สูงอายุ: {yesNo(fac.elderly_friendly)}</span>
            <span>รถเข็น: {yesNo(fac.wheelchair)}</span>
            <span className="inline-flex items-center gap-1"><Baby size={14} /> เด็ก: {yesNo(fac.kid_friendly)}</span>
            <span>สัตว์เลี้ยง: {yesNo(fac.pet_friendly)}</span>
          </div>
        ) : <p className="text-sm text-muted">รอตรวจสอบ</p>}
      </section>

      {hasCoords ? (
        <div className="grid grid-cols-2 gap-2">
          {gmaps && (
            <a href={gmaps} target="_blank" rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary text-primary">
              <MapIcon size={18} /> Google Maps
            </a>
          )}
          {osm && (
            <a href={osm} target="_blank" rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line">
              <ExternalLink size={18} /> OpenStreetMap
            </a>
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">ยังไม่มีพิกัด — จัดเส้นทางให้สถานที่นี้ไม่ได้จนกว่าจะเพิ่มพิกัด</p>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
        <h2 className="mb-2 font-semibold">แหล่งข้อมูล</h2>
        {sources.length === 0 ? (
          <p className="text-muted">ยังไม่มีแหล่งข้อมูล</p>
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.id}>
                <a href={s.source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">
                  {s.source_name ?? SOURCE_TYPE[s.source_type] ?? s.source_url}
                </a>
                <p className="text-xs text-muted">
                  ตรวจเมื่อ {fmtDate(s.checked_at)}{s.fields.length ? ` · ใช้สำหรับ: ${s.fields.join(', ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        {p.verified_at && <p className="mt-2 text-xs text-muted">ตรวจสอบข้อมูลล่าสุด {fmtDate(p.verified_at)}</p>}
        <p className="mt-2 text-xs text-muted">เวลาเปิด-ปิดและราคาอาจเปลี่ยนแปลง ควรตรวจสอบก่อนเดินทาง</p>
        {images.length === 0 && <p className="mt-2 text-xs text-muted">ภาพปกด้านบนเป็นภาพประกอบที่สร้างอัตโนมัติ ไม่ใช่รูปจริงของสถานที่</p>}
      </section>

      <VisitSheet open={visitOpen} target={{ placeId: p.id, userPlaceId: null, provinceId: p.province_id, name: p.name_th }}
        onClose={() => setVisitOpen(false)}
        onSaved={(_, failed) => {
          toast(failed ? `บันทึกแล้ว แต่อัปโหลดรูปไม่สำเร็จ ${failed} รูป` : 'บันทึกความทรงจำแล้ว 🎉', failed ? 'error' : 'success');
          loadVisits();
          void my.setStatus(p.id, 'visited').catch(() => undefined);
        }} />
    </div>
  );
}
