import { useState } from 'react';
import { Plus } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { ItemIcon, ITEM_COLOR } from './itemIcons';
import { toDbTime, toMin } from '../routing/time';
import { DEFAULT_DURATION, ITEM_TYPE_LABEL, type TripItemType } from './types';
import type { NewItem } from './tripsApi';

const TYPES: TripItemType[] = ['meal', 'cafe', 'lodging', 'rest_stop', 'custom', 'free_time'];
const PRESET_TIME: Partial<Record<TripItemType, string>> = { lodging: '14:00' };

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (row: Omit<NewItem, 'trip_id' | 'day_id' | 'sort_order'>) => Promise<void>;
};

function parseLatLng(s: string) {
  const m = /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)/.exec(s);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

export function AddItemSheet({ open, onClose, onAdd }: Props) {
  const [type, setType] = useState<TripItemType>('meal');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(DEFAULT_DURATION.meal);
  const [useTime, setUseTime] = useState(false);
  const [time, setTime] = useState('12:00');
  const [coords, setCoords] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = (t: TripItemType) => {
    setType(t);
    setDuration(DEFAULT_DURATION[t]);
    setUseTime(Boolean(PRESET_TIME[t]));
    if (PRESET_TIME[t]) setTime(PRESET_TIME[t] as string);
  };

  const add = async () => {
    const ll = coords.trim() ? parseLatLng(coords) : null;
    if (coords.trim() && !ll) { setErr('พิกัดไม่ถูกต้อง (เช่น 13.7563, 100.5018)'); return; }
    setBusy(true);
    try {
      await onAdd({
        item_type: type,
        title: (title.trim() || (type === 'lodging' ? 'Check-in ที่พัก' : ITEM_TYPE_LABEL[type])).slice(0, 200),
        duration_min: Math.max(0, Math.min(1440, Math.round(duration))),
        start_time: useTime ? toDbTime(toMin(time)) : null,
        is_locked_time: useTime && type === 'lodging',
        lat: ll?.lat ?? null,
        lng: ll?.lng ?? null,
      });
      setTitle(''); setCoords(''); setErr(null);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="เพิ่มกิจกรรม"
      footer={<Button className="w-full" icon={<Plus size={20} />} disabled={busy} onClick={() => void add()}>{busy ? 'กำลังเพิ่ม…' : 'เพิ่ม'}</Button>}>
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <button key={t} type="button" onClick={() => pick(t)} aria-pressed={type === t}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs ${type === t ? 'border-primary ring-2 ring-primary' : 'border-line'}`}>
            <span style={{ color: ITEM_COLOR[t] }}><ItemIcon type={t} size={22} /></span>
            {ITEM_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <label className="block text-sm">ชื่อ (ไม่บังคับ)
        <input className="input mt-1" maxLength={200} value={title} placeholder={ITEM_TYPE_LABEL[type]} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">ใช้เวลา (นาที)
          <input type="number" inputMode="numeric" min={0} max={1440} className="input mt-1" value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} />
        </label>
        <div className="text-sm">
          <label className="flex min-h-6 items-center gap-2"><input type="checkbox" checked={useTime} onChange={(e) => setUseTime(e.target.checked)} /> กำหนดเวลา</label>
          <input type="time" disabled={!useTime} className="input mt-1 disabled:opacity-40" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <label className="block text-sm">พิกัด (ไม่บังคับ — ใช้คำนวณระยะทาง)
        <input className="input mt-1" placeholder="13.7563, 100.5018" value={coords} onChange={(e) => setCoords(e.target.value)} />
      </label>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </BottomSheet>
  );
}
