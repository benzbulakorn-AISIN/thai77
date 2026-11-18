import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Save, Trash2 } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { fmtDateTh, toDbTime, toMin } from '../routing/time';
import { DEFAULT_DURATION, ITEM_TYPE_LABEL, type TripDay, type TripItem } from './types';

type TimeMode = 'auto' | 'earliest' | 'locked';
export type ItemPatch = Partial<Pick<TripItem, 'title' | 'duration_min' | 'start_time' | 'is_locked_time' | 'travel_min_override' | 'est_cost' | 'notes' | 'day_id'>>;

type Props = {
  item: TripItem | null;
  days: TripDay[];
  onClose: () => void;
  onSave: (id: string, patch: ItemPatch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const num = (s: string) => (s.trim() === '' ? null : Number.isFinite(Number(s)) && Number(s) >= 0 ? Number(s) : NaN);

export function ItemSheet({ item, days, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [timeMode, setTimeMode] = useState<TimeMode>('auto');
  const [time, setTime] = useState('09:00');
  const [travel, setTravel] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [dayId, setDayId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDuration(item.duration_min ?? DEFAULT_DURATION[item.item_type]);
    setTimeMode(item.start_time ? (item.is_locked_time ? 'locked' : 'earliest') : 'auto');
    setTime(item.start_time ? item.start_time.slice(0, 5) : '09:00');
    setTravel(item.travel_min_override != null ? String(item.travel_min_override) : '');
    setCost(item.est_cost != null ? String(item.est_cost) : '');
    setNotes(item.notes ?? '');
    setDayId(item.day_id ?? '');
    setErr(null);
  }, [item]);

  if (!item) return null;
  const isPlace = item.item_type === 'place';

  const save = async () => {
    const t = title.trim();
    const tr = num(travel), c = num(cost);
    if (!t) { setErr('กรอกชื่อ'); return; }
    if (Number.isNaN(tr) || (tr != null && tr > 1440)) { setErr('เวลาเดินทางไม่ถูกต้อง'); return; }
    if (Number.isNaN(c)) { setErr('ค่าใช้จ่ายไม่ถูกต้อง'); return; }
    setBusy(true);
    try {
      await onSave(item.id, {
        title: t.slice(0, 200),
        duration_min: Math.min(1440, Math.max(0, Math.round(duration))),
        start_time: timeMode === 'auto' ? null : toDbTime(toMin(time)),
        is_locked_time: timeMode === 'locked',
        travel_min_override: tr,
        est_cost: c,
        notes: notes.trim() || null,
        day_id: dayId || null,
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title={ITEM_TYPE_LABEL[item.item_type]}
      footer={<Button className="w-full" icon={<Save size={20} />} disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>}>
      <label className="block text-sm">ชื่อ
        <input className="input mt-1" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {isPlace && item.place_id && (
        <Link to={`/place/${item.place_id}`} className="inline-flex items-center gap-1 text-sm text-primary underline">
          <ExternalLink size={14} /> ดูข้อมูลสถานที่
        </Link>
      )}

      <div className="text-sm">
        <p className="mb-1">ใช้เวลา</p>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((m) => (
            <button key={m} type="button" onClick={() => setDuration(m)}
              className={`min-h-10 rounded-full border px-3 ${duration === m ? 'border-primary bg-primary text-on-primary' : 'border-line'}`}>
              {m < 60 ? `${m} น.` : `${m / 60} ชม.`}
            </button>
          ))}
          <input type="number" inputMode="numeric" aria-label="นาที" min={0} max={1440} value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 0)} className="input w-24 min-h-10" />
        </div>
      </div>

      <div className="text-sm">
        <p className="mb-1">เวลาเริ่ม</p>
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-line">
          {([['auto', 'อัตโนมัติ'], ['earliest', 'ไม่ก่อน'], ['locked', 'ล็อกเวลา']] as [TimeMode, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTimeMode(k)}
              className={`min-h-10 ${timeMode === k ? 'bg-primary text-on-primary' : ''}`}>{l}</button>
          ))}
        </div>
        {timeMode !== 'auto' && <input type="time" className="input mt-2" value={time} onChange={(e) => setTime(e.target.value)} />}
        <p className="mt-1 text-xs text-muted">
          {timeMode === 'locked' ? 'เช่น เวลา Check-in หรือเวลานัด — ถ้าไปไม่ทันจะแจ้งเตือน' : timeMode === 'earliest' ? 'ถ้าถึงก่อนจะรอจนถึงเวลานี้' : 'ต่อจากกิจกรรมก่อนหน้า'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">เวลาเดินทางมาจุดนี้ (นาที)
          <input type="number" inputMode="numeric" min={0} className="input mt-1" placeholder="อัตโนมัติ" value={travel} onChange={(e) => setTravel(e.target.value)} />
        </label>
        <label className="block text-sm">ค่าใช้จ่ายโดยประมาณ (บาท)
          <input type="number" inputMode="decimal" min={0} className="input mt-1" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">ใส่เวลาเดินทางเองได้ เช่น นั่งเรือข้ามเกาะ</p>

      <label className="block text-sm">อยู่ในวัน
        <select className="input mt-1" value={dayId} onChange={(e) => setDayId(e.target.value)}>
          <option value="">ยังไม่จัดวัน</option>
          {days.map((d) => <option key={d.id} value={d.id}>วัน {d.day_index}{d.date ? ` · ${fmtDateTh(d.date)}` : ''}</option>)}
        </select>
      </label>

      <label className="block text-sm">หมายเหตุ
        <textarea className="input mt-1 min-h-20 py-2" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-10 items-center gap-1 text-sm text-red-600">
        <Trash2 size={16} /> ลบออกจากทริป
      </button>

      <ConfirmDialog open={confirm} title="ลบออกจากทริป?" message={`ลบ “${item.title}” ออกจากแผน`} confirmText="ลบ" danger busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => { setBusy(true); try { await onDelete(item.id); setConfirm(false); onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }} />
    </BottomSheet>
  );
}
