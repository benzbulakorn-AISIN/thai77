import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Save, Star, X } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../auth/AuthProvider';
import { listTrips, type TripSummary } from '../trips/tripsApi';
import { todayIso } from '../routing/time';
import { ACCEPT_IMAGES, compressImage, type Compressed } from './imageCompress';
import { MAX_PHOTOS, saveVisit, type Photo, type Visit, type VisitInput } from './memoriesApi';
import { StarRating } from './StarRating';

export type VisitTarget = { placeId: string | null; userPlaceId: string | null; provinceId: string | null; name: string };

type Props = {
  open: boolean;
  target: VisitTarget | null;
  /** existing visit when editing */
  visit?: Visit | null;
  photos?: Photo[];
  onClose: () => void;
  onSaved: (id: string, failedPhotos: number) => void;
};

type NewPhoto = { key: string; comp: Compressed; preview: string };
const txt = (s: string, max: number) => s.trim().slice(0, max) || null;

export function VisitSheet({ open, target, visit = null, photos = [], onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [date, setDate] = useState(todayIso());
  const [rating, setRating] = useState(0);
  const [impression, setImpression] = useState('');
  const [liked, setLiked] = useState('');
  const [caution, setCaution] = useState('');
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [companions, setCompanions] = useState('');
  const [wantReturn, setWantReturn] = useState<boolean | null>(null);
  const [tripId, setTripId] = useState('');
  const [shareTrip, setShareTrip] = useState(false);
  const [added, setAdded] = useState<NewPhoto[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(null); // 'e:<id>' | 'n:<key>'
  const [working, setWorking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addedRef = useRef<NewPhoto[]>([]);
  addedRef.current = added;

  const revokeAll = () => addedRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
  useEffect(() => () => revokeAll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setDate(visit?.visited_on ?? todayIso());
    setRating(visit?.rating ?? 0);
    setImpression(visit?.impression ?? '');
    setLiked(visit?.liked ?? '');
    setCaution(visit?.caution ?? '');
    setNotes(visit?.notes ?? '');
    setCost(visit?.actual_cost != null ? String(visit.actual_cost) : '');
    setCompanions(visit?.companions ?? '');
    setWantReturn(visit?.want_return ?? null);
    setTripId(visit?.trip_id ?? '');
    setShareTrip(visit?.share_with_trip ?? false);
    revokeAll();
    setAdded([]);
    setRemoved([]);
    setCover(visit?.cover_photo_id ? `e:${visit.cover_photo_id}` : null);
    setErr(null);
    setWorking(null);
    listTrips().then((ts) => {
      setTrips(ts);
      if (!visit) {
        const t = ts.find((x) => x.start_date <= todayIso() && x.end_date >= todayIso());
        if (t) setTripId(t.id);
      }
    }).catch(() => setTrips([]));
  }, [open, visit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !target) return null;

  const kept = photos.filter((p) => !removed.includes(p.id));
  const room = MAX_PHOTOS - kept.length - added.length;
  const effectiveCover = cover ?? (kept[0] ? `e:${kept[0].id}` : added[0] ? `n:${added[0].key}` : null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, room));
    const errs: string[] = [];
    if (files.length > room) errs.push(`เพิ่มได้อีก ${Math.max(0, room)} รูป (สูงสุด ${MAX_PHOTOS} รูป)`);
    for (let i = 0; i < list.length; i++) {
      setWorking(`กำลังย่อรูป ${i + 1}/${list.length}`);
      try {
        const comp = await compressImage(list[i]);
        setAdded((a) => [...a, { key: crypto.randomUUID(), comp, preview: URL.createObjectURL(comp.blob) }]);
      } catch (e) {
        errs.push(`${list[i].name}: ${(e as Error).message}`);
      }
    }
    setWorking(null);
    setErr(errs.length ? errs.join('\n') : null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAdded = (key: string) => setAdded((a) => {
    const p = a.find((x) => x.key === key);
    if (p) URL.revokeObjectURL(p.preview);
    return a.filter((x) => x.key !== key);
  });

  const save = async () => {
    if (!user) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErr('เลือกวันที่'); return; }
    if (date > todayIso()) { setErr('วันที่ไปต้องไม่เป็นวันในอนาคต'); return; }
    const c = cost.trim() === '' ? null : Number(cost.replace(/[,\s฿]/g, ''));
    if (c != null && !(Number.isFinite(c) && c >= 0 && c < 10_000_000)) { setErr('ค่าใช้จ่ายไม่ถูกต้อง'); return; }
    const input: VisitInput = {
      place_id: target.placeId,
      user_place_id: target.userPlaceId,
      province_id: target.provinceId,
      place_name: target.name.slice(0, 200),
      trip_id: tripId || null,
      visited_on: date,
      rating: rating || null,
      impression: txt(impression, 4000),
      notes: txt(notes, 2000),
      liked: txt(liked, 1000),
      caution: txt(caution, 1000),
      actual_cost: c,
      companions: txt(companions, 200),
      want_return: wantReturn,
      share_with_trip: Boolean(tripId) && shareTrip,
    };
    const coverArg = effectiveCover?.startsWith('e:')
      ? { kind: 'existing' as const, id: effectiveCover.slice(2) }
      : effectiveCover?.startsWith('n:')
        ? { kind: 'new' as const, index: added.findIndex((p) => p.key === effectiveCover.slice(2)) }
        : null;
    setErr(null);
    setWorking('กำลังบันทึก…');
    try {
      const r = await saveVisit({
        userId: user.id, id: visit?.id ?? null, input, removedPhotoIds: removed, added: added.map((p) => p.comp),
        startOrder: Math.max(0, ...photos.map((p) => p.sort_order + 1)), cover: coverArg,
        onProgress: (d, t) => t && setWorking(`กำลังอัปโหลดรูป ${Math.min(d + 1, t)}/${t}`),
      });
      revokeAll();
      setAdded([]);
      onSaved(r.id, r.failed);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const tile = (key: string, url: string | null, onRemove: () => void) => (
    <div key={key} className={`relative aspect-square overflow-hidden rounded-xl bg-surface-2 ${effectiveCover === key ? 'ring-3 ring-amber-400' : ''}`}>
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      <button type="button" aria-label="ตั้งเป็นรูปหน้าปก" onClick={() => setCover(key)}
        className="absolute bottom-1 left-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white">
        <Star size={16} className={effectiveCover === key ? 'fill-amber-400 text-amber-400' : ''} />
      </button>
      <button type="button" aria-label="เอารูปออก" onClick={onRemove}
        className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white">
        <X size={16} />
      </button>
    </div>
  );

  return (
    <BottomSheet open onClose={() => !working && onClose()} title={visit ? 'แก้ไขความทรงจำ' : `ไปมาแล้ว: ${target.name}`}
      footer={<Button className="w-full" icon={<Save size={20} />} disabled={Boolean(working)} onClick={() => void save()}>{working ?? 'บันทึก'}</Button>}>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">วันที่ไป
          <input type="date" max={todayIso()} className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block text-sm">ทริป
          <select className="input mt-1" value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">ไม่ระบุ</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>

      <div className="text-sm">
        <p>คะแนน</p>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <div className="text-sm">
        <p className="mb-1">รูปภาพ ({kept.length + added.length}/{MAX_PHOTOS}) <span className="text-xs text-muted">แตะ ★ เพื่อเลือกรูปหน้าปก</span></p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {kept.map((p) => tile(`e:${p.id}`, p.url, () => setRemoved((r) => [...r, p.id])))}
          {added.map((p) => tile(`n:${p.key}`, p.preview, () => removeAdded(p.key)))}
          {room > 0 && (
            <button type="button" disabled={Boolean(working)} onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-xs text-muted">
              <ImagePlus size={24} /> เพิ่มรูป
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT_IMAGES} multiple hidden onChange={(e) => void onFiles(e.target.files)} />
        <p className="mt-1 text-xs text-muted">ย่อรูปอัตโนมัติ (≤1600px) และลบข้อมูลตำแหน่ง GPS ในรูปก่อนอัปโหลด · รูปเป็นส่วนตัว</p>
      </div>

      <label className="block text-sm">ความประทับใจ
        <textarea className="input mt-1 min-h-24 py-2" maxLength={4000} value={impression} onChange={(e) => setImpression(e.target.value)} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">👍 สิ่งที่ชอบ
          <input className="input mt-1" maxLength={1000} value={liked} onChange={(e) => setLiked(e.target.value)} />
        </label>
        <label className="block text-sm">⚠️ สิ่งที่ควรระวัง
          <input className="input mt-1" maxLength={1000} value={caution} onChange={(e) => setCaution(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">ค่าใช้จ่ายจริง (บาท)
          <input inputMode="decimal" className="input mt-1" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
        <label className="block text-sm">ไปกับใคร
          <input className="input mt-1" maxLength={200} value={companions} onChange={(e) => setCompanions(e.target.value)} />
        </label>
      </div>

      <div className="text-sm">
        <p className="mb-1">อยากกลับไปอีกไหม</p>
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-line">
          {([[true, 'อยาก'], [false, 'ไม่แล้ว'], [null, 'ไม่ระบุ']] as [boolean | null, string][]).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={wantReturn === v} onClick={() => setWantReturn(v)}
              className={`min-h-11 ${wantReturn === v ? 'bg-primary text-on-primary' : ''}`}>{l}</button>
          ))}
        </div>
      </div>

      <label className="block text-sm">หมายเหตุ
        <textarea className="input mt-1 min-h-16 py-2" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {tripId && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={shareTrip} onChange={(e) => setShareTrip(e.target.checked)} />
          ให้คนในทริปนี้เห็นบันทึกนี้ (รูปยังเป็นส่วนตัว)
        </label>
      )}

      {err && <p className="whitespace-pre-line text-sm text-red-600">{err}</p>}
    </BottomSheet>
  );
}
