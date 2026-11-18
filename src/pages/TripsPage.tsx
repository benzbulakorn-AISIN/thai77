import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, LogIn, Luggage, Plus, Users } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { useCart } from '../features/cart/CartProvider';
import { listTrips, type TripSummary } from '../features/trips/tripsApi';
import { fmtDateTh, todayIso } from '../features/routing/time';
import { MODE_LABEL } from '../features/routing/provider';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';

export function TripsPage() {
  const { user, loading: authLoading } = useAuth();
  const cart = useCart();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listTrips().then(setTrips).catch((e: Error) => setError(e.message));
  }, [user]);

  if (authLoading) return <Skeleton className="h-40" />;
  if (!user) {
    return (
      <EmptyState icon={<Luggage size={40} />} title="เข้าสู่ระบบเพื่อวางแผนทริป" text="ทริปจะถูกบันทึกไว้ในบัญชีของคุณ"
        action={<Link to="/auth/login"><Button icon={<LogIn size={20} />}>เข้าสู่ระบบ</Button></Link>} />
    );
  }

  const today = todayIso();
  const upcoming = (trips ?? []).filter((t) => t.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = (trips ?? []).filter((t) => t.end_date < today);

  const card = (t: TripSummary) => (
    <Link key={t.id} to={`/trips/${t.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary"><Luggage size={22} /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{t.name}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {fmtDateTh(t.start_date)} – {fmtDateTh(t.end_date)}</span>
          <span className="inline-flex items-center gap-1"><Users size={12} /> {t.travelers} คน · {MODE_LABEL[t.mode]}</span>
          {t.owner_id !== user.id && <span className="rounded-full bg-surface-2 px-2">ร่วมวางแผน</span>}
        </p>
      </div>
      <ChevronRight className="text-muted" />
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ทริปของฉัน</h1>
        <Link to="/cart"><Button icon={<Plus size={20} />}>สร้างทริป{cart.items.length ? ` (${cart.items.length})` : ''}</Button></Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!trips && !error && <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
      {trips && trips.length === 0 && (
        <EmptyState icon={<Luggage size={40} />} title="ยังไม่มีทริป" text="เลือกสถานที่จากหน้าจังหวัด กด “ใส่ทริป” แล้วมาสร้างแผนที่ตะกร้า"
          action={<Link to="/" className="text-primary underline">ไปเลือกสถานที่</Link>} />
      )}
      {upcoming.length > 0 && <section className="space-y-2"><h2 className="font-semibold">กำลังจะไป</h2>{upcoming.map(card)}</section>}
      {past.length > 0 && <section className="space-y-2"><h2 className="font-semibold text-muted">ที่ผ่านมา</h2>{past.map(card)}</section>}
    </div>
  );
}
