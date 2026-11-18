import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, LogIn, MapPin, MapPinOff, MapPinPlus, Plus, Send } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { useReference } from '../features/provinces/useGeoData';
import { fetchCategories } from '../features/places/placesApi';
import { CategoryIcon } from '../features/places/categoryIcons';
import type { Category } from '../features/places/types';
import { createMyPlace, deleteMyPlace, listMyPlaces, updateMyPlace, type UserPlace, type UserPlaceInput } from '../features/myplaces/userPlacesApi';
import { UserPlaceSheet } from '../features/myplaces/UserPlaceSheet';
import { VisitSheet, type VisitTarget } from '../features/memories/VisitSheet';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

export function MyPlacesPage() {
  const { user, loading: authLoading } = useAuth();
  const { provinces } = useReference();
  const toast = useToast();
  const [places, setPlaces] = useState<UserPlace[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserPlace | null | 'new'>(null);
  const [visitTarget, setVisitTarget] = useState<VisitTarget | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchCategories().then(setCats).catch(() => setCats([]));
    listMyPlaces(user.id).then(setPlaces).catch((e: Error) => setError(e.message));
  }, [user]);

  const provName = useMemo(() => new Map(provinces.map((p) => [p.id, p.name_th])), [provinces]);
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  if (authLoading) return <Skeleton className="h-40" />;
  if (!user) {
    return <EmptyState icon={<MapPinPlus size={40} />} title="เข้าสู่ระบบเพื่อเพิ่มสถานที่ส่วนตัว"
      action={<Link to="/auth/login"><Button icon={<LogIn size={20} />}>เข้าสู่ระบบ</Button></Link>} />;
  }

  const save = async (v: UserPlaceInput, id: string | null) => {
    if (id) {
      await updateMyPlace(id, v);
      setPlaces((xs) => (xs ?? []).map((p) => (p.id === id ? { ...p, ...v } : p)));
    } else {
      const created = await createMyPlace(user.id, v);
      setPlaces((xs) => [created, ...(xs ?? [])]);
    }
    toast('บันทึกแล้ว', 'success');
  };
  const remove = async (id: string) => {
    await deleteMyPlace(id);
    setPlaces((xs) => (xs ?? []).filter((p) => p.id !== id));
    toast('ลบแล้ว', 'success');
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/profile" aria-label="กลับ" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><ArrowLeft /></Link>
        <h1 className="flex-1 text-2xl font-bold">สถานที่ส่วนตัว</h1>
      </header>
      <p className="text-sm text-muted">ที่ที่ยังไม่มีในแอป เช่น ร้านลับ บ้านญาติ จุดชมวิวที่เจอเอง — เห็นเฉพาะคุณ</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!places && !error && <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
      {places && places.length === 0 && (
        <EmptyState icon={<MapPinPlus size={40} />} title="ยังไม่มีสถานที่ส่วนตัว" text="กดปุ่มด้านล่างเพื่อเพิ่มที่แรก" />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {(places ?? []).map((p) => {
          const c = p.category_id ? catById.get(p.category_id) : undefined;
          const hasLL = p.lat != null && p.lng != null;
          const mapUrl = p.google_maps_url ?? (hasLL ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : null);
          return (
            <article key={p.id} className="rounded-2xl border border-line bg-surface p-3">
              <button type="button" onClick={() => setEditing(p)} className="flex w-full gap-3 text-left">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: c?.color ?? '#64748B' }}>
                  <CategoryIcon name={c?.icon} size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name_th}</span>
                  <span className="block truncate text-xs text-muted">
                    {c?.name_th ?? 'ไม่ระบุหมวด'}{p.province_id ? ` · ${provName.get(p.province_id) ?? ''}` : ''}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-2 text-xs">
                    {hasLL ? <span className="inline-flex items-center gap-1 text-green-700"><MapPin size={12} /> มีพิกัด</span>
                      : <span className="inline-flex items-center gap-1 text-amber-700"><MapPinOff size={12} /> ไม่มีพิกัด</span>}
                    {p.submission === 'submitted' && <span className="inline-flex items-center gap-1 text-primary"><Send size={12} /> เสนอ Admin แล้ว</span>}
                    {p.submission === 'approved' && <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={12} /> อนุมัติแล้ว</span>}
                  </span>
                </span>
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" className="min-h-10 text-sm"
                  onClick={() => setVisitTarget({ placeId: null, userPlaceId: p.id, provinceId: p.province_id, name: p.name_th })}>
                  ✅ บันทึกการไป
                </Button>
                {mapUrl ? (
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer nofollow"
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-line text-sm">
                    <ExternalLink size={16} /> แผนที่
                  </a>
                ) : <span />}
              </div>
            </article>
          );
        })}
      </div>

      <Button className="w-full" icon={<Plus size={20} />} onClick={() => setEditing('new')}>เพิ่มสถานที่ส่วนตัว</Button>

      <UserPlaceSheet open={editing !== null} place={editing === 'new' ? null : editing} categories={cats}
        onClose={() => setEditing(null)} onSave={save} onDelete={remove} />
      <VisitSheet open={visitTarget !== null} target={visitTarget} onClose={() => setVisitTarget(null)}
        onSaved={(_, failed) => toast(failed ? `บันทึกแล้ว แต่อัปโหลดรูปไม่สำเร็จ ${failed} รูป` : 'บันทึกความทรงจำแล้ว', failed ? 'error' : 'success')} />
    </div>
  );
}
