import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Camera, CalendarDays, ChevronRight, Compass, LogIn, Luggage, MapPinPlus, Users } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { useCart } from '../features/cart/CartProvider';
import { useReference } from '../features/provinces/useGeoData';
import { useProvinceStatsWithGuest as useProvinceStats } from '../features/guest/useStatsWithGuest';
import { useWantList } from '../features/explore/useWantList';
import { regionCards } from '../features/explore/exploreModel';
import { listTrips, type TripSummary } from '../features/trips/tripsApi';
import { fmtDateTh, todayIso } from '../features/routing/time';
import {
  TOTAL_PROVINCES, countdownText, displayName, greetingForHour, percent, pickNextTrip, provinceProgress, sumStats,
} from '../features/home/homeModel';
import { Skeleton } from '../components/ui/Skeleton';

const PRIMARY_LINK =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-on-primary hover:opacity-90';
const OUTLINE_LINK =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary px-4 font-medium text-primary';

function ProgressRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20 shrink-0" role="img" aria-label={`ไปแล้ว ${pct}%`}>
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="42" cy="42" r={r} fill="none" strokeWidth="9" stroke="var(--surface-2)" />
        <circle cx="42" cy="42" r={r} fill="none" strokeWidth="9" strokeLinecap="round" stroke="var(--primary)"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-sm font-bold">{pct}%</span>
    </div>
  );
}

export function HomePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { regions, provinces, error: refError, loading: refLoading } = useReference();
  const stats = useProvinceStats();
  const cart = useCart();
  const want = useWantList();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [tripError, setTripError] = useState<string | null>(null);
  const uid = user?.id ?? null;

  useEffect(() => {
    if (!uid) { setTrips(null); setTripError(null); return; }
    let alive = true;
    listTrips()
      .then((t) => { if (alive) { setTrips(t); setTripError(null); } })
      .catch((e: Error) => { if (alive) setTripError(e.message); });
    return () => { alive = false; };
  }, [uid]);

  const next = useMemo(() => (trips ? pickNextTrip(trips, todayIso()) : null), [trips]);
  const cards = useMemo(() => regionCards(regions, provinces, stats), [regions, provinces, stats]);
  const progress = useMemo(() => provinceProgress(provinces.map((p) => p.id), stats), [provinces, stats]);
  const totals = useMemo(() => sumStats(stats), [stats]);

  const name = displayName(profile?.display_name, user?.email);
  const greeting = greetingForHour(new Date().getHours());

  const tiles = [
    { to: '/explore', Icon: Bookmark, label: 'ที่สนใจ', sub: `${want.items.length} แห่ง${user ? '' : ' · ในเครื่องนี้'}` },
    { to: '/cart', Icon: Luggage, label: 'ตะกร้าทริป', sub: `${cart.items.length} แห่ง` },
    { to: '/memories', Icon: Camera, label: 'ความทรงจำ', sub: user ? `ไปแล้ว ${totals.visited} แห่ง` : 'เข้าสู่ระบบเพื่อใช้' },
    { to: '/my-places', Icon: MapPinPlus, label: 'สถานที่ส่วนตัว', sub: 'เพิ่มที่ของคุณเอง' },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{greeting}{name ? ` ${name}` : ''}</h1>
        <p className="text-sm text-muted">วันนี้อยากไปไหนดี</p>
      </header>

      {/* progress + the one primary action */}
      <section aria-label="ความคืบหน้า" className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-4">
          <ProgressRing pct={progress.pct} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">ไปแล้ว</p>
            <p className="text-2xl font-bold">{progress.done}/{TOTAL_PROVINCES} <span className="text-base font-normal">จังหวัด</span></p>
            <p className="text-sm text-muted">{totals.visited} สถานที่ที่เคยไป · ในระบบ {totals.total} แห่ง</p>
            {!authLoading && !user && totals.visited > 0 && (
              <p className="mt-1 text-xs text-muted">นับจากที่บันทึกไว้ในเครื่องนี้ · เข้าสู่ระบบเพื่อเก็บถาวร</p>
            )}
          </div>
        </div>

        {refLoading ? (
          <Skeleton className="h-28" />
        ) : cards.length > 0 ? (
          <ul className="space-y-2.5" aria-label="ความคืบหน้าแต่ละภาค">
            {cards.map((c) => (
              <li key={c.code}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.name}
                  </span>
                  <span className="text-muted">{c.visitedCount}/{c.provinceCount}</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${percent(c.visitedCount, c.provinceCount)}%`, background: c.color }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
            {refError ?? 'ยังไม่มีรายชื่อจังหวัดในฐานข้อมูล — รัน supabase/seed_geo.sql ใน Supabase SQL Editor'}
          </p>
        )}

        <Link to="/explore" className={PRIMARY_LINK}><Compass size={20} /> เริ่มสำรวจ</Link>
      </section>

      {/* next trip */}
      <section aria-label="ทริปที่กำลังจะไป" className="space-y-2">
        <h2 className="font-semibold">ทริปที่กำลังจะไป</h2>
        {authLoading ? (
          <Skeleton className="h-24" />
        ) : !user ? (
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm text-muted">เข้าสู่ระบบเพื่อบันทึกทริป ความทรงจำ และความคืบหน้า 77 จังหวัดของคุณ</p>
            <Link to="/auth/login" className={OUTLINE_LINK}><LogIn size={18} /> เข้าสู่ระบบ</Link>
          </div>
        ) : tripError ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-red-600">{tripError}</p>
        ) : trips === null ? (
          <Skeleton className="h-24" />
        ) : next ? (
          <Link to={`/trips/${next.trip.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary"><Luggage size={22} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{next.trip.name}</span>
              <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {fmtDateTh(next.trip.start_date)} – {fmtDateTh(next.trip.end_date, true)}</span>
                <span className="inline-flex items-center gap-1"><Users size={12} /> {next.trip.travelers} คน</span>
              </span>
              <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-primary">{countdownText(next)}</span>
            </span>
            <ChevronRight className="shrink-0 text-muted" />
          </Link>
        ) : (
          <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm text-muted">ยังไม่มีทริปที่กำลังจะไป — เลือกสถานที่แล้วกด “จัดทริป” ในหน้าสำรวจ</p>
            {cart.items.length > 0 && <Link to="/cart" className="inline-block text-sm text-primary underline">ดูตะกร้า ({cart.items.length} แห่ง)</Link>}
          </div>
        )}
      </section>

      {/* shortcuts */}
      <section aria-label="ทางลัด" className="grid grid-cols-2 gap-3">
        {tiles.map(({ to, Icon, label, sub }) => (
          <Link key={label} to={to} className="flex min-h-20 items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary"><Icon size={22} /></span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{label}</span>
              <span className="block truncate text-xs text-muted">{sub}</span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
