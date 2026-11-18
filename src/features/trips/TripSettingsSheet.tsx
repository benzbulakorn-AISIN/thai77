import { useEffect, useState } from 'react';
import { Save, Trash2, UserPlus } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { MODE_LABEL } from '../routing/provider';
import { daysBetween } from '../routing/time';
import { inviteMember } from './tripsApi';
import type { TravelMode, Trip } from './types';

export type TripSettings = {
  name: string; start_date: string; end_date: string; travelers: number; mode: TravelMode;
  day_start_time: string; day_end_time: string; road_factor: number;
};

type Props = {
  open: boolean;
  trip: Trip;
  isOwner: boolean;
  onClose: () => void;
  onSave: (s: TripSettings) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function TripSettingsSheet({ open, trip, isOwner, onClose, onSave, onDelete }: Props) {
  const toast = useToast();
  const [s, setS] = useState<TripSettings | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setS({
      name: trip.name, start_date: trip.start_date, end_date: trip.end_date, travelers: trip.travelers, mode: trip.mode,
      day_start_time: trip.day_start_time.slice(0, 5), day_end_time: trip.day_end_time.slice(0, 5), road_factor: Number(trip.road_factor) || 1.3,
    });
  }, [open, trip]);

  if (!open || !s) return null;
  const set = <K extends keyof TripSettings>(k: K, v: TripSettings[K]) => setS((x) => (x ? { ...x, [k]: v } : x));
  const n = daysBetween(s.start_date, s.end_date) + 1;

  const save = async () => {
    if (!s.name.trim()) { toast('กรอกชื่อทริป', 'error'); return; }
    if (n < 1 || n > 30) { toast('จำนวนวันต้องอยู่ระหว่าง 1–30 วัน', 'error'); return; }
    if (s.day_end_time <= s.day_start_time) { toast('เวลาเลิกเที่ยวต้องหลังเวลาออกเดินทาง', 'error'); return; }
    setBusy(true);
    try { await onSave({ ...s, name: s.name.trim().slice(0, 120), travelers: Math.min(50, Math.max(1, s.travelers || 1)) }); onClose(); }
    catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  const invite = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast('อีเมลไม่ถูกต้อง', 'error'); return; }
    try { await inviteMember(trip.id, email.trim()); toast('ชวนแล้ว อีกฝ่ายจะเห็นทริปนี้และแก้ไขได้', 'success'); setEmail(''); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <BottomSheet open onClose={onClose} title="ตั้งค่าทริป"
      footer={<Button className="w-full" icon={<Save size={20} />} disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>}>
      <label className="block text-sm">ชื่อทริป
        <input className="input mt-1" maxLength={120} value={s.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">วันเริ่ม<input type="date" className="input mt-1" value={s.start_date} onChange={(e) => set('start_date', e.target.value)} /></label>
        <label className="block text-sm">วันสุดท้าย<input type="date" className="input mt-1" min={s.start_date} value={s.end_date} onChange={(e) => set('end_date', e.target.value)} /></label>
      </div>
      {n < daysBetween(trip.start_date, trip.end_date) + 1 && <p className="-mt-2 text-xs text-amber-700">วันที่ถูกตัดออก กิจกรรมจะย้ายไป “ยังไม่จัดวัน”</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">จำนวนคน<input type="number" min={1} max={50} className="input mt-1" value={s.travelers} onChange={(e) => set('travelers', Number(e.target.value))} /></label>
        <label className="block text-sm">เดินทางโดย
          <select className="input mt-1" value={s.mode} onChange={(e) => set('mode', e.target.value as TravelMode)}>
            {(Object.keys(MODE_LABEL) as TravelMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">ออกเดินทาง<input type="time" className="input mt-1" value={s.day_start_time} onChange={(e) => set('day_start_time', e.target.value)} /></label>
        <label className="block text-sm">เลิกเที่ยว<input type="time" className="input mt-1" value={s.day_end_time} onChange={(e) => set('day_end_time', e.target.value)} /></label>
      </div>
      <label className="block text-sm">ตัวคูณระยะทางถนน ({s.road_factor.toFixed(2)})
        <input type="range" min={1} max={2} step={0.05} className="mt-2 w-full" value={s.road_factor} onChange={(e) => set('road_factor', Number(e.target.value))} />
        <span className="text-xs text-muted">ระยะถนนจริงมักไกลกว่าเส้นตรง 1.2–1.5 เท่า (ภูเขาใช้ค่าสูงขึ้น)</span>
      </label>

      {isOwner && (
        <section className="space-y-2 rounded-xl bg-surface-2 p-3">
          <p className="text-sm font-medium">ชวนคนร่วมวางแผน</p>
          <div className="flex gap-2">
            <input type="email" className="input" placeholder="อีเมลของอีกคน" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button variant="secondary" icon={<UserPlus size={18} />} onClick={() => void invite()}>ชวน</Button>
          </div>
        </section>
      )}

      {isOwner && (
        <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-10 items-center gap-1 text-sm text-red-600">
          <Trash2 size={16} /> ลบทริปนี้
        </button>
      )}
      <ConfirmDialog open={confirm} danger busy={busy} title="ลบทริปถาวร?" confirmText="ลบถาวร"
        message={'ทริป แผนรายวัน และงบประมาณของทริปนี้จะถูกลบถาวร กู้คืนไม่ได้\n(สถานที่และความทรงจำที่บันทึกไว้จะไม่ถูกลบ)'}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => { setBusy(true); try { await onDelete(); } catch (e) { toast((e as Error).message, 'error'); setBusy(false); } }} />
    </BottomSheet>
  );
}
