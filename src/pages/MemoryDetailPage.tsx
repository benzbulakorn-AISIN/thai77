import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Luggage, MapPin, Pencil, Trash2, Users, Wallet, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useReference } from '../features/provinces/useGeoData';
import { deleteVisit, getVisit, type Photo, type Visit } from '../features/memories/memoriesApi';
import { VisitSheet } from '../features/memories/VisitSheet';
import { Stars } from '../features/memories/StarRating';
import { fmtDateTh } from '../features/routing/time';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

function Lightbox({ photos, index, onClose, onIndex }: { photos: Photo[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex(Math.min(photos.length - 1, index + 1));
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [index, photos.length, onClose, onIndex]);
  const p = photos[index];
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="ดูรูป" className="fixed inset-0 z-[950] flex items-center justify-center bg-black/90" onClick={onClose}>
      {p?.url && <img src={p.url} alt="" className="max-h-[90dvh] max-w-[96vw] object-contain" onClick={(e) => e.stopPropagation()} />}
      <button type="button" aria-label="ปิด" onClick={onClose} className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white"><X /></button>
      {index > 0 && (
        <button type="button" aria-label="รูปก่อนหน้า" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}
          className="absolute left-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white"><ChevronLeft /></button>
      )}
      {index < photos.length - 1 && (
        <button type="button" aria-label="รูปถัดไป" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}
          className="absolute right-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white"><ChevronRight /></button>
      )}
      <p className="absolute bottom-4 text-sm text-white/80">{index + 1}/{photos.length}</p>
    </div>,
    document.body,
  );
}

export function MemoryDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const { provinces } = useReference();
  const [data, setData] = useState<{ visit: Visit; photos: Photo[] } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<number | null>(null);

  const reload = useCallback(() => {
    if (!id) return;
    getVisit(id).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  if (error) return <EmptyState icon={<X size={40} />} title={error} action={<Button onClick={reload}>ลองใหม่</Button>} />;
  if (data === undefined) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;
  if (data === null) return <EmptyState icon={<MapPin size={40} />} title="ไม่พบความทรงจำนี้" action={<Link to="/memories" className="text-primary underline">กลับ</Link>} />;

  const { visit: v, photos } = data;
  const mine = v.user_id === user?.id;
  const province = provinces.find((p) => p.id === v.province_id);
  const coverFirst = [...photos].sort((a, b) => Number(b.id === v.cover_photo_id) - Number(a.id === v.cover_photo_id));

  const remove = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await deleteVisit(user.id, v);
      toast('ลบแล้ว', 'success');
      nav('/memories', { replace: true });
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  const field = (label: string, value: string | null) => value && (
    <div><p className="text-xs text-muted">{label}</p><p className="whitespace-pre-line text-sm">{value}</p></div>
  );

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2">
        <Link to="/memories" aria-label="กลับ" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><ArrowLeft /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">{v.place_name}</h1>
          <p className="text-sm text-muted">{fmtDateTh(v.visited_on, true)}{province ? ` · ${province.name_th}` : ''}</p>
          <Stars value={v.rating} size={18} />
        </div>
        {mine && (
          <button type="button" aria-label="แก้ไข" onClick={() => setEdit(true)} className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-surface-2"><Pencil /></button>
        )}
      </header>

      {coverFirst.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {coverFirst.map((p, i) => (
            <button key={p.id} type="button" onClick={() => setView(i)} aria-label={`ดูรูปที่ ${i + 1}`}
              className={`overflow-hidden rounded-xl bg-surface-2 ${i === 0 ? 'col-span-2 row-span-2' : ''} aspect-square`}>
              {p.url && <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </button>
          ))}
        </div>
      )}

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        {field('ความประทับใจ', v.impression)}
        {field('👍 สิ่งที่ชอบ', v.liked)}
        {field('⚠️ สิ่งที่ควรระวัง', v.caution)}
        {field('หมายเหตุ', v.notes)}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {v.actual_cost != null && <span className="inline-flex items-center gap-1"><Wallet size={14} /> ฿{v.actual_cost.toLocaleString('th-TH')}</span>}
          {v.companions && <span className="inline-flex items-center gap-1"><Users size={14} /> {v.companions}</span>}
          {v.want_return != null && <span>{v.want_return ? '🔁 อยากกลับไปอีก' : 'ไม่กลับไปอีกแล้ว'}</span>}
          {v.trip_id && <Link to={`/trips/${v.trip_id}`} className="inline-flex items-center gap-1 text-primary underline"><Luggage size={14} /> ดูทริป</Link>}
          {v.place_id && <Link to={`/place/${v.place_id}`} className="inline-flex items-center gap-1 text-primary underline"><MapPin size={14} /> ดูสถานที่</Link>}
        </div>
        {!v.impression && !v.liked && !v.caution && !v.notes && photos.length === 0 && (
          <p className="text-sm text-muted">ยังไม่มีรายละเอียด — กด ✏️ เพื่อเพิ่มรูปและความประทับใจ</p>
        )}
      </section>

      {mine && (
        <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-10 items-center gap-1 text-sm text-red-600">
          <Trash2 size={16} /> ลบความทรงจำนี้
        </button>
      )}

      {view !== null && <Lightbox photos={coverFirst} index={view} onIndex={setView} onClose={() => setView(null)} />}
      <VisitSheet open={edit} visit={v} photos={photos}
        target={{ placeId: v.place_id, userPlaceId: v.user_place_id, provinceId: v.province_id, name: v.place_name }}
        onClose={() => setEdit(false)}
        onSaved={(_, failed) => { toast(failed ? `บันทึกแล้ว แต่อัปโหลดรูปไม่สำเร็จ ${failed} รูป` : 'บันทึกแล้ว', failed ? 'error' : 'success'); reload(); }} />
      <ConfirmDialog open={confirm} danger busy={busy} title="ลบความทรงจำถาวร?" confirmText="ลบถาวร"
        message={`บันทึกนี้และรูป ${photos.length} รูปจะถูกลบถาวร กู้คืนไม่ได้\n(ถ้าต้องการเก็บไว้ ให้ Export Backup ก่อน)`}
        onCancel={() => setConfirm(false)} onConfirm={() => void remove()} />
    </div>
  );
}
