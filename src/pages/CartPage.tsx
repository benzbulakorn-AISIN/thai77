import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, LogIn, Luggage, MapPinOff, Route, Trash2, X } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { useCart } from '../features/cart/CartProvider';
import { useReference } from '../features/provinces/useGeoData';
import { createTrip, insertItems, listTrips, loadTrip, markPlanned, type TripSummary } from '../features/trips/tripsApi';
import { replanTrip } from '../features/trips/schedule';
import { addDays, daysBetween, todayIso } from '../features/routing/time';
import { MODE_LABEL } from '../features/routing/provider';
import type { GeoPoint, TravelMode } from '../features/trips/types';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';

type Draft = {
  target: 'new' | string; // 'new' or existing trip id
  name: string;
  start: string;
  end: string;
  travelers: number;
  mode: TravelMode;
  from: 'here' | 'auto' | 'custom' | `place:${string}`;
  customFrom: string;
  to: 'start' | 'none' | `place:${string}`;
  dayStart: string;
  dayEnd: string;
};
const DRAFT_KEY = 'thai77.cartDraft.v1';
const defaultDraft = (): Draft => {
  const s = addDays(todayIso(), 7);
  return { target: 'new', name: '', start: s, end: addDays(s, 1), travelers: 2, mode: 'car', from: 'auto', customFrom: '', to: 'none', dayStart: '07:00', dayEnd: '20:00' };
};
const readDraft = (): Draft => {
  try { return { ...defaultDraft(), ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') }; } catch { return defaultDraft(); }
};

/** "13.7563, 100.5018" or a Google Maps URL containing @lat,lng or q=lat,lng */
function parseLatLng(s: string): { lat: number; lng: number } | null {
  const m = /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)/.exec(s);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106 ? { lat, lng } : null;
}

export function CartPage() {
  const { user } = useAuth();
  const cart = useCart();
  const nav = useNavigate();
  const toast = useToast();
  const { provinces } = useReference();
  const [d, setD] = useState<Draft>(readDraft);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); }, [d]); // autosave
  useEffect(() => { if (user) listTrips().then(setTrips).catch(() => setTrips([])); }, [user]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const provNames = useMemo(() => {
    const ids = [...new Set(cart.items.map((i) => i.province_id))];
    return ids.map((id) => provinces.find((p) => p.id === id)?.name_th).filter(Boolean) as string[];
  }, [cart.items, provinces]);
  const located = cart.items.filter((i) => i.lat != null && i.lng != null);
  const nDays = d.start && d.end ? daysBetween(d.start, d.end) + 1 : 0;
  const upcoming = trips.filter((t) => t.end_date >= todayIso());

  if (!cart.items.length) {
    return (
      <EmptyState icon={<Luggage size={40} />} title="ตะกร้าว่าง" text="เปิดหน้าจังหวัด แล้วกด “ใส่ทริป” ที่สถานที่ที่อยากไป"
        action={<Link to="/" className="text-primary underline">ไปเลือกสถานที่</Link>} />
    );
  }

  const getHere = () => new Promise<GeoPoint>((res, rej) => {
    if (!navigator.geolocation) { rej(new Error('อุปกรณ์นี้หาตำแหน่งไม่ได้')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => res({ label: 'ตำแหน่งของฉัน', lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }),
      () => rej(new Error('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง')), { timeout: 10000, maximumAge: 300000 });
  });
  const placePoint = (key: string): GeoPoint | null => {
    const c = cart.items.find((i) => `place:${i.id}` === key);
    return c && c.lat != null && c.lng != null ? { label: c.name_th, lat: c.lat, lng: c.lng } : null;
  };

  const submit = async () => {
    if (!user) return;
    if (d.target === 'new') {
      if (!d.start || !d.end || nDays < 1) { toast('วันที่สิ้นสุดต้องไม่ก่อนวันเริ่ม', 'error'); return; }
      if (nDays > 30) { toast('ทริปยาวได้ไม่เกิน 30 วัน', 'error'); return; }
      if (d.dayEnd <= d.dayStart) { toast('เวลาเลิกเที่ยวต้องหลังเวลาออกเดินทาง', 'error'); return; }
    }
    setBusy(true);
    let createdId: string | null = null;
    try {
      let start: GeoPoint | null = null;
      if (d.from === 'here') start = await getHere();
      else if (d.from === 'custom') {
        const p = parseLatLng(d.customFrom);
        if (!p) throw new Error('พิกัดจุดเริ่มไม่ถูกต้อง (เช่น 13.7563, 100.5018)');
        start = { label: 'จุดเริ่มต้น', ...p };
      } else if (d.from.startsWith('place:')) start = placePoint(d.from);
      const end: GeoPoint | null = d.to === 'start' ? (start ? { ...start, label: `กลับ${start.label}` } : null)
        : d.to.startsWith('place:') ? placePoint(d.to) : null;

      const rows = (tripId: string, base: number) => cart.items.map((c, i) => ({
        trip_id: tripId, day_id: null, item_type: 'place' as const, title: c.name_th, place_id: c.id,
        lat: c.lat, lng: c.lng, sort_order: base + i * 10, duration_min: c.suggested_minutes ?? 60, est_cost: c.est_cost,
      }));

      if (d.target === 'new') {
        const { trip, days } = await createTrip(user.id, {
          name: d.name.trim() || `เที่ยว${provNames.slice(0, 3).join(' ')}`.slice(0, 120),
          province_ids: [...new Set(cart.items.map((i) => i.province_id))],
          start_date: d.start, end_date: d.end, travelers: Math.min(50, Math.max(1, d.travelers || 1)), mode: d.mode,
          start_point: start, end_point: end, day_start_time: `${d.dayStart}:00`, day_end_time: `${d.dayEnd}:00`,
        });
        createdId = trip.id;
        const items = await insertItems(rows(trip.id, 0));
        const plan = await replanTrip(trip, days, items);
        if (plan.unscheduled.length) toast(`มี ${plan.unscheduled.length} แห่งที่ยังไม่ได้จัดวัน (เวลาไม่พอหรือไม่มีพิกัด)`, 'info');
      } else {
        const t = await loadTrip(d.target);
        if (!t) throw new Error('ไม่พบทริป');
        createdId = t.trip.id;
        const exist = new Set(t.items.map((i) => i.place_id));
        const fresh = rows(t.trip.id, 10000).filter((r) => !exist.has(r.place_id));
        await insertItems(fresh);
        toast(`เพิ่ม ${fresh.length} แห่งในทริปแล้ว — กด “จัดเส้นทางใหม่” เพื่อจัดวัน`, 'success');
      }
      await markPlanned(user.id, cart.items.map((i) => i.id));
      cart.clear();
      localStorage.removeItem(DRAFT_KEY);
      nav(`/trips/${createdId}`);
    } catch (e) {
      toast((e as Error).message || 'สร้างแผนไม่สำเร็จ', 'error');
      if (createdId) nav(`/trips/${createdId}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ตะกร้าทริป ({cart.items.length})</h1>
        <button type="button" onClick={() => setConfirmClear(true)} className="inline-flex min-h-10 items-center gap-1 text-sm text-red-600">
          <Trash2 size={16} /> ล้าง
        </button>
      </div>

      <ol className="space-y-2">
        {cart.items.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 pl-3">
            <span className="w-6 text-center text-sm font-bold text-primary">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <Link to={`/place/${c.id}`} className="block truncate font-medium">{c.name_th}</Link>
              <p className="text-xs text-muted">
                {provinces.find((p) => p.id === c.province_id)?.name_th}
                {c.lat == null && <span className="ml-2 inline-flex items-center gap-1 text-amber-700"><MapPinOff size={12} /> ไม่มีพิกัด</span>}
              </p>
            </div>
            <button type="button" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => cart.move(i, i - 1)} className="flex h-10 w-9 items-center justify-center rounded-lg disabled:opacity-30"><ArrowUp size={18} /></button>
            <button type="button" aria-label="เลื่อนลง" disabled={i === cart.items.length - 1} onClick={() => cart.move(i, i + 1)} className="flex h-10 w-9 items-center justify-center rounded-lg disabled:opacity-30"><ArrowDown size={18} /></button>
            <button type="button" aria-label="เอาออก" onClick={() => cart.remove(c.id)} className="flex h-10 w-9 items-center justify-center rounded-lg text-red-600"><X size={18} /></button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">ลำดับในตะกร้าไม่สำคัญ ระบบจะจัดเส้นทางให้ใหม่ · มีพิกัด {located.length}/{cart.items.length} แห่ง</p>

      {!user ? (
        <EmptyState icon={<LogIn size={36} />} title="เข้าสู่ระบบเพื่อสร้างแผนเที่ยว" text="ตะกร้าจะยังอยู่ในเครื่องนี้"
          action={<Link to="/auth/login"><Button icon={<LogIn size={20} />}>เข้าสู่ระบบ</Button></Link>} />
      ) : (
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
          {upcoming.length > 0 && (
            <label className="block text-sm">ใส่ลงใน
              <select className="input mt-1" value={d.target} onChange={(e) => set('target', e.target.value)}>
                <option value="new">➕ สร้างทริปใหม่</option>
                {upcoming.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}

          {d.target === 'new' && (
            <>
              <label className="block text-sm">ชื่อทริป
                <input className="input mt-1" maxLength={120} value={d.name} placeholder={`เที่ยว${provNames.slice(0, 3).join(' ')}`}
                  onChange={(e) => set('name', e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">วันเริ่ม
                  <input type="date" className="input mt-1" value={d.start} onChange={(e) => {
                    const v = e.target.value;
                    setD((s) => ({ ...s, start: v, end: s.end < v ? v : s.end }));
                  }} />
                </label>
                <label className="block text-sm">วันสุดท้าย
                  <input type="date" className="input mt-1" min={d.start} value={d.end} onChange={(e) => set('end', e.target.value)} />
                </label>
              </div>
              <p className="-mt-2 text-xs text-muted">{nDays > 0 ? `${nDays} วัน` : 'วันที่ไม่ถูกต้อง'}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">จำนวนคน
                  <input type="number" inputMode="numeric" min={1} max={50} className="input mt-1" value={d.travelers}
                    onChange={(e) => set('travelers', Number(e.target.value))} />
                </label>
                <label className="block text-sm">เดินทางโดย
                  <select className="input mt-1" value={d.mode} onChange={(e) => set('mode', e.target.value as TravelMode)}>
                    {(Object.keys(MODE_LABEL) as TravelMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm">เริ่มจาก
                <select className="input mt-1" value={d.from} onChange={(e) => set('from', e.target.value as Draft['from'])}>
                  <option value="auto">ให้ระบบเลือกจุดแรก</option>
                  <option value="here">📍 ตำแหน่งปัจจุบัน</option>
                  <option value="custom">ใส่พิกัดเอง</option>
                  {located.map((c) => <option key={c.id} value={`place:${c.id}`}>{c.name_th}</option>)}
                </select>
              </label>
              {d.from === 'custom' && (
                <label className="block text-sm">พิกัด (คัดลอกจาก Google Maps)
                  <input className="input mt-1" placeholder="13.7563, 100.5018" value={d.customFrom} onChange={(e) => set('customFrom', e.target.value)} />
                </label>
              )}
              <label className="block text-sm">จบที่
                <select className="input mt-1" value={d.to} onChange={(e) => set('to', e.target.value as Draft['to'])}>
                  <option value="none">ที่ไหนก็ได้</option>
                  {d.from !== 'auto' && <option value="start">กลับจุดเริ่มต้น</option>}
                  {located.map((c) => <option key={c.id} value={`place:${c.id}`}>{c.name_th}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">ออกเดินทาง
                  <input type="time" className="input mt-1" value={d.dayStart} onChange={(e) => set('dayStart', e.target.value)} />
                </label>
                <label className="block text-sm">เลิกเที่ยว
                  <input type="time" className="input mt-1" value={d.dayEnd} onChange={(e) => set('dayEnd', e.target.value)} />
                </label>
              </div>
              <p className="text-xs text-muted">ตำแหน่งเริ่มต้นเป็นข้อมูลส่วนตัว ไม่ถูกแชร์</p>
            </>
          )}

          <Button className="w-full" icon={<Route size={20} />} disabled={busy} onClick={() => void submit()}>
            {busy ? 'กำลังจัดแผน…' : d.target === 'new' ? 'จัดเส้นทางและสร้างแผนเที่ยว' : 'เพิ่มเข้าทริป'}
          </Button>
          <p className="text-center text-xs text-muted">เส้นทางแนะนำเบื้องต้น · ประมาณจากระยะเส้นตรง แก้ลำดับได้ภายหลัง</p>
        </section>
      )}

      <ConfirmDialog open={confirmClear} title="ล้างตะกร้า?" message="เอาสถานที่ทั้งหมดออกจากตะกร้า" confirmText="ล้าง" danger
        onCancel={() => setConfirmClear(false)} onConfirm={() => { cart.clear(); setConfirmClear(false); }} />
    </div>
  );
}
