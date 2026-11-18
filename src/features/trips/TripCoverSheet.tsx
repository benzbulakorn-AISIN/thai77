import { useEffect, useState } from 'react';
import { Check, Wand2 } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { clearTripCover, listMyPhotos, setTripCoverFromMemory, type MyPhoto } from './tripCoverApi';
import { TripCover } from './TripCover';

type Props = {
  open: boolean;
  trip: { id: string; name: string; province_ids: string[] } | null;
  userId: string;
  currentPath: string | null;
  currentUrl: string | null;
  onClose: () => void;
  onChanged: () => void;
};

/** Choose a trip cover from the owner's own memory photos, or go back to the automatic cover. */
export function TripCoverSheet({ open, trip, userId, currentPath, currentUrl, onClose, onChanged }: Props) {
  const toast = useToast();
  const [photos, setPhotos] = useState<MyPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null); setError(null); setPhotos(null);
    let alive = true;
    listMyPhotos().then((p) => { if (alive) setPhotos(p); }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [open]);

  if (!open || !trip) return null;
  const chosen = photos?.find((p) => p.id === selected) ?? null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, 'success'); onChanged(); onClose(); }
    catch (e) { toast((e as Error).message || 'ไม่สำเร็จ', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <BottomSheet open onClose={() => !busy && onClose()} title="เปลี่ยนปกทริป"
      footer={
        <div className="space-y-2">
          <Button className="w-full" icon={<Check size={20} />} disabled={!chosen || busy}
            onClick={() => chosen && void run(() => setTripCoverFromMemory({ userId, tripId: trip.id, memoryPath: chosen.storage_path, oldPath: currentPath }), 'เปลี่ยนปกแล้ว')}>
            {busy ? 'กำลังบันทึก…' : 'ใช้รูปนี้เป็นปก'}
          </Button>
          {currentPath && (
            <Button variant="ghost" className="w-full border border-line" icon={<Wand2 size={18} />} disabled={busy}
              onClick={() => void run(() => clearTripCover({ userId, tripId: trip.id, oldPath: currentPath }), 'กลับไปใช้ปกอัตโนมัติแล้ว')}>
              ใช้ปกอัตโนมัติ
            </Button>
          )}
        </div>
      }>
      <div className="w-40 max-w-full">
        <TripCover tripId={trip.id} name={trip.name} provinceIds={trip.province_ids} url={currentUrl} />
      </div>
      <p className="text-sm text-muted">ปกตอนนี้{currentPath ? ' (รูปที่เลือก)' : ' (อัตโนมัติ — สีตามภาคของทริป)'} · เลือกรูปจากความทรงจำของคุณเท่านั้น รูปยังเป็นส่วนตัว คนที่ร่วมทริปเห็นได้</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!photos && !error && <div className="grid grid-cols-3 gap-2"><Skeleton className="aspect-square" /><Skeleton className="aspect-square" /><Skeleton className="aspect-square" /></div>}
      {photos && photos.length === 0 && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">ยังไม่มีรูปในความทรงจำ — บันทึกการไปพร้อมรูปก่อน แล้วกลับมาเลือกปก</p>}
      {photos && photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="รูปความทรงจำ">
          {photos.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={selected === p.id} aria-label="เลือกรูปนี้" onClick={() => setSelected(p.id)}
              className={`relative aspect-square overflow-hidden rounded-xl bg-surface-2 ${selected === p.id ? 'ring-4 ring-primary' : ''}`}>
              <img src={p.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              {selected === p.id && <span className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-primary"><Check size={16} /></span>}
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
