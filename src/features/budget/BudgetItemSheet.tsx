import { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { fmtDateTh } from '../routing/time';
import { BudgetIcon } from './BudgetIcon';
import type { BudgetCategory, BudgetItem, BudgetItemInput, Member } from './budgetApi';
import type { TripDay } from '../trips/types';

type Props = {
  open: boolean;
  /** null = new item */
  item: BudgetItem | null;
  /** quick "record actual spend" mode for new items */
  spendMode: boolean;
  categories: BudgetCategory[];
  days: TripDay[];
  members: Member[];
  defaultDayId: string | null;
  currentUserId: string;
  onClose: () => void;
  onSave: (v: BudgetItemInput, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const parseMoney = (s: string): number | null | typeof NaN => {
  const t = s.replace(/[,\s฿]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : NaN;
};

export function BudgetItemSheet(p: Props) {
  const [cat, setCat] = useState('');
  const [label, setLabel] = useState('');
  const [est, setEst] = useState('');
  const [act, setAct] = useState('');
  const [day, setDay] = useState('');
  const [shared, setShared] = useState(true);
  const [paidBy, setPaidBy] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!p.open) return;
    const it = p.item;
    setCat(it?.category_id ?? p.categories.find((c) => c.slug === 'food')?.id ?? p.categories[0]?.id ?? '');
    setLabel(it?.label ?? '');
    setEst(it ? String(it.estimated || '') : '');
    setAct(it?.actual != null ? String(it.actual) : '');
    setDay(it ? it.day_id ?? '' : p.defaultDayId ?? '');
    setShared(it?.is_shared ?? true);
    setPaidBy(it?.paid_by ?? p.currentUserId);
    setNotes(it?.notes ?? '');
    setErr(null);
  }, [p.open, p.item, p.categories, p.defaultDayId, p.currentUserId]);

  if (!p.open) return null;
  const catName = p.categories.find((c) => c.id === cat)?.name_th ?? '';

  const save = async () => {
    const e = parseMoney(est), a = parseMoney(act);
    if (Number.isNaN(e) || Number.isNaN(a)) { setErr('จำนวนเงินไม่ถูกต้อง'); return; }
    if (e == null && a == null) { setErr(p.spendMode ? 'กรอกจำนวนเงินที่จ่าย' : 'กรอกค่าประมาณหรือค่าใช้จ่ายจริง'); return; }
    if (!cat) { setErr('เลือกหมวด'); return; }
    setBusy(true);
    try {
      await p.onSave({
        category_id: cat,
        day_id: day || null,
        label: (label.trim() || catName).slice(0, 200),
        estimated: e ?? 0,
        actual: a,
        is_shared: shared,
        paid_by: a != null ? paidBy || null : null,
        notes: notes.trim().slice(0, 1000) || null,
      }, p.item?.id ?? null);
      p.onClose();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  const title = p.item ? 'แก้ไขค่าใช้จ่าย' : p.spendMode ? 'บันทึกค่าใช้จ่ายจริง' : 'เพิ่มรายการงบ';
  const moneyFirst = p.spendMode && !p.item;

  const actualField = (
    <label className="block text-sm">จ่ายจริง (บาท)
      <input inputMode="decimal" className="input mt-1 text-lg font-semibold" placeholder="0" value={act}
        autoFocus={moneyFirst} onChange={(e) => setAct(e.target.value)} />
    </label>
  );

  return (
    <BottomSheet open onClose={p.onClose} title={title}
      footer={<Button className="w-full" icon={<Save size={20} />} disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>}>
      {moneyFirst && actualField}

      <div>
        <p className="mb-1 text-sm">หมวด</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {p.categories.map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[11px] leading-tight ${cat === c.id ? 'border-primary ring-2 ring-primary' : 'border-line'}`}>
              <span style={{ color: c.color }}><BudgetIcon name={c.icon} size={18} /></span>
              {c.name_th}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-sm">รายการ
        <input className="input mt-1" maxLength={200} placeholder={catName} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">ค่าประมาณ (บาท)
          <input inputMode="decimal" className="input mt-1" placeholder="0" value={est} onChange={(e) => setEst(e.target.value)} />
        </label>
        {!moneyFirst ? actualField : <div />}
      </div>

      <label className="block text-sm">วัน
        <select className="input mt-1" value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">ทั้งทริป</option>
          {p.days.map((d) => <option key={d.id} value={d.id}>วัน {d.day_index}{d.date ? ` · ${fmtDateTh(d.date)}` : ''}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line text-sm">
        <button type="button" aria-pressed={shared} onClick={() => setShared(true)} className={`min-h-11 ${shared ? 'bg-primary text-on-primary' : ''}`}>หารร่วมกัน</button>
        <button type="button" aria-pressed={!shared} onClick={() => setShared(false)} className={`min-h-11 ${!shared ? 'bg-primary text-on-primary' : ''}`}>ส่วนตัว</button>
      </div>

      {p.members.length > 1 && act.trim() !== '' && (
        <label className="block text-sm">ใครจ่าย
          <select className="input mt-1" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {p.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      )}

      <label className="block text-sm">หมายเหตุ
        <input className="input mt-1" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {p.item?.is_auto && <p className="text-xs text-muted">รายการนี้คำนวณอัตโนมัติ ถ้าแก้ไข ระบบจะไม่คำนวณทับอีก</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      {p.item && (
        <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-10 items-center gap-1 text-sm text-red-600">
          <Trash2 size={16} /> ลบรายการ
        </button>
      )}
      <ConfirmDialog open={confirm} danger busy={busy} title="ลบรายการ?" confirmText="ลบ"
        message={`ลบ “${p.item?.label ?? ''}” ออกจากงบประมาณ`}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          if (!p.item) return;
          setBusy(true);
          try { await p.onDelete(p.item.id); setConfirm(false); p.onClose(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
        }} />
    </BottomSheet>
  );
}
