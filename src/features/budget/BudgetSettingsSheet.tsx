import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import type { Trip } from '../trips/types';

export type BudgetSettings = {
  budget_total: number | null;
  budget_per_person: number | null;
  reserve_pct: number;
  fuel_km_per_l: number | null;
  fuel_price_per_l: number | null;
  vehicle_count: number;
  meal_cost_pp: number;
};

type Props = {
  open: boolean;
  trip: Trip;
  defaults: { kmPerL: number; pricePerL: number };
  onClose: () => void;
  onSave: (s: BudgetSettings) => Promise<void>;
};

const RESERVES = [0, 10, 15, 20];
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[,\s]/g, '')));
const ok = (n: number | null, max: number) => n == null || (Number.isFinite(n) && n >= 0 && n <= max);

export function BudgetSettingsSheet({ open, trip, defaults, onClose, onSave }: Props) {
  const [mode, setMode] = useState<'total' | 'pp'>('total');
  const [amount, setAmount] = useState('');
  const [reserve, setReserve] = useState(10);
  const [kmpl, setKmpl] = useState('');
  const [price, setPrice] = useState('');
  const [vehicles, setVehicles] = useState('1');
  const [meal, setMeal] = useState('150');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const pp = trip.budget_total == null && trip.budget_per_person != null;
    setMode(pp ? 'pp' : 'total');
    setAmount(String((pp ? trip.budget_per_person : trip.budget_total) ?? ''));
    setReserve(trip.reserve_pct ?? 10);
    setKmpl(trip.fuel_km_per_l != null ? String(trip.fuel_km_per_l) : '');
    setPrice(trip.fuel_price_per_l != null ? String(trip.fuel_price_per_l) : '');
    setVehicles(String(trip.vehicle_count ?? 1));
    setMeal(String(trip.meal_cost_pp ?? 150));
    setErr(null);
  }, [open, trip]);

  if (!open) return null;

  const save = async () => {
    const a = toNum(amount), k = toNum(kmpl), pr = toNum(price), v = toNum(vehicles), m = toNum(meal);
    if (!ok(a, 10_000_000) || !ok(pr, 200) || !ok(m, 100_000)) { setErr('ตัวเลขไม่ถูกต้อง'); return; }
    if (k != null && !(k > 0 && k <= 100)) { setErr('อัตราสิ้นเปลืองต้องมากกว่า 0'); return; }
    if (v == null || !(Number.isInteger(v) && v >= 0 && v <= 20)) { setErr('จำนวนรถ 0–20 คัน'); return; }
    setBusy(true);
    try {
      await onSave({
        budget_total: mode === 'total' ? a : null,
        budget_per_person: mode === 'pp' ? a : null,
        reserve_pct: reserve,
        fuel_km_per_l: k,
        fuel_price_per_l: pr,
        vehicle_count: v,
        meal_cost_pp: m ?? 0,
      });
      onClose();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  return (
    <BottomSheet open onClose={onClose} title="ตั้งค่างบประมาณ"
      footer={<Button className="w-full" icon={<Save size={20} />} disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>}>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line text-sm">
        <button type="button" onClick={() => setMode('total')} className={`min-h-11 ${mode === 'total' ? 'bg-primary text-on-primary' : ''}`}>งบรวม</button>
        <button type="button" onClick={() => setMode('pp')} className={`min-h-11 ${mode === 'pp' ? 'bg-primary text-on-primary' : ''}`}>งบต่อคน</button>
      </div>
      <label className="block text-sm">{mode === 'total' ? 'งบรวมทั้งทริป (บาท)' : `งบต่อคน (บาท) × ${trip.travelers} คน`}
        <input inputMode="decimal" className="input mt-1 text-lg font-semibold" placeholder="ไม่กำหนด" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>

      <div className="text-sm">
        <p className="mb-1">เงินสำรองฉุกเฉิน</p>
        <div className="grid grid-cols-4 gap-2">
          {RESERVES.map((r) => (
            <button key={r} type="button" onClick={() => setReserve(r)}
              className={`min-h-10 rounded-full border ${reserve === r ? 'border-primary bg-primary text-on-primary' : 'border-line'}`}>{r}%</button>
          ))}
        </div>
      </div>

      <section className="space-y-2 rounded-xl bg-surface-2 p-3">
        <p className="text-sm font-medium">ค่าน้ำมัน (ใช้กับรถยนต์/จักรยานยนต์)</p>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-xs">กม./ลิตร
            <input inputMode="decimal" className="input mt-1" placeholder={String(defaults.kmPerL)} value={kmpl} onChange={(e) => setKmpl(e.target.value)} />
          </label>
          <label className="block text-xs">บาท/ลิตร
            <input inputMode="decimal" className="input mt-1" placeholder={String(defaults.pricePerL)} value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="block text-xs">จำนวนรถ
            <input inputMode="numeric" className="input mt-1" value={vehicles} onChange={(e) => setVehicles(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-muted">ช่องว่าง = ใช้ค่าเริ่มต้น {defaults.kmPerL} กม./ลิตร · ฿{defaults.pricePerL}/ลิตร — ราคาน้ำมันเปลี่ยนบ่อย ควรใส่ราคาปัจจุบันเอง</p>
      </section>

      <label className="block text-sm">ค่าอาหารต่อคนต่อมื้อ (บาท)
        <input inputMode="decimal" className="input mt-1" value={meal} onChange={(e) => setMeal(e.target.value)} />
        <span className="text-xs text-muted">ใช้ประมาณมื้ออาหารใน Timeline ที่ยังไม่ได้ใส่ราคา</span>
      </label>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </BottomSheet>
  );
}
