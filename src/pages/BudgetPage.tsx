import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calculator, Info, Plus, Receipt, Settings, TriangleAlert, Wallet } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { loadTrip, updateTrip } from '../features/trips/tripsApi';
import { computeTrip } from '../features/trips/schedule';
import { fmtDateTh } from '../features/routing/time';
import {
  addBudgetItem, deleteBudgetItem, fetchBudgetCategories, fetchBudgetItems, fetchFuelDefaults, fetchMembers, replaceAutoRows,
  updateBudgetItem, type BudgetCategory, type BudgetItem, type BudgetItemInput, type Member,
} from '../features/budget/budgetApi';
import { baht, budgetLimit, groupBy, settlement, summarize, type BudgetStatus } from '../features/budget/calc';
import { buildAutoRows, fuelParams } from '../features/budget/estimate';
import { BudgetIcon } from '../features/budget/BudgetIcon';
import { BudgetItemSheet } from '../features/budget/BudgetItemSheet';
import { BudgetSettingsSheet, type BudgetSettings } from '../features/budget/BudgetSettingsSheet';
import type { Trip, TripDay, TripItem } from '../features/trips/types';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

type Tab = 'category' | 'day' | 'list' | 'paid';
const STATUS_COLOR: Record<BudgetStatus, string> = { ok: '#16A34A', near: '#EAB308', over: '#DC2626', none: '#64748B' };
const STATUS_TEXT: Record<BudgetStatus, string> = { ok: 'อยู่ในงบ', near: 'ใกล้เต็มงบ', over: 'เกินงบ', none: 'ยังไม่ตั้งงบ' };

function Bar({ label, value, limit, status }: { label: string; value: number; limit: number | null; status: BudgetStatus }) {
  const pct = limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold">{baht(value)}{limit ? <span className="text-xs font-normal text-muted"> ({Math.round((value / limit) * 100)}%)</span> : null}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-all" style={{ width: `${limit ? pct : 0}%`, background: STATUS_COLOR[status] }} />
      </div>
    </div>
  );
}

export function BudgetPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<TripDay[]>([]);
  const [tItems, setTItems] = useState<TripItem[]>([]);
  const [lines, setLines] = useState<BudgetItem[]>([]);
  const [cats, setCats] = useState<BudgetCategory[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [defaults, setDefaults] = useState({ kmPerL: 14, pricePerL: 35 });
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [tab, setTab] = useState<Tab>('category');
  const [sheet, setSheet] = useState<{ item: BudgetItem | null; spend: boolean } | null>(null);
  const [settings, setSettings] = useState(false);
  const [confirmCalc, setConfirmCalc] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const [t, b, c, m, d] = await Promise.all([loadTrip(id), fetchBudgetItems(id), fetchBudgetCategories(), fetchMembers(id), fetchFuelDefaults(user?.id)]);
      if (!t) { setState('missing'); return; }
      setTrip(t.trip); setDays(t.days); setTItems(t.items); setLines(b); setCats(c); setMembers(m); setDefaults(d);
      setState('ok');
    } catch { setState('error'); }
  }, [id, user?.id]);
  useEffect(() => { void reload(); }, [reload]);

  const views = useMemo(() => (trip ? computeTrip(trip, days, tItems) : []), [trip, days, tItems]);
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const dayById = useMemo(() => new Map(days.map((d) => [d.id, d])), [days]);
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  if (state === 'loading') return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-48" /><Skeleton className="h-64" /></div>;
  if (state === 'missing') return <EmptyState icon={<Wallet size={40} />} title="ไม่พบทริปนี้" action={<Link to="/trips" className="text-primary underline">กลับรายการทริป</Link>} />;
  if (state === 'error' || !trip || !user) return <EmptyState icon={<TriangleAlert size={40} />} title="โหลดงบประมาณไม่สำเร็จ" action={<Button onClick={() => void reload()}>ลองใหม่</Button>} />;

  const limit = budgetLimit(trip.budget_total != null ? Number(trip.budget_total) : null, trip.budget_per_person != null ? Number(trip.budget_per_person) : null, trip.travelers);
  const s = summarize(lines, { reservePct: trip.reserve_pct ?? 0, limit, travelers: trip.travelers });
  const usesFuel = trip.mode === 'car' || trip.mode === 'motorcycle';
  const fp = fuelParams(trip, defaults);
  const headStatus: BudgetStatus = s.actual > 0 ? s.spendStatus : s.planStatus;
  const autoCount = lines.filter((l) => l.is_auto).length;

  // ---------- actions ----------
  const recalc = async () => {
    setBusy(true);
    try {
      const manual = lines.filter((l) => !l.is_auto);
      const fuelCat = cats.find((c) => c.slug === 'fuel')?.id;
      const rows = buildAutoRows({
        trip, items: tItems, defaults,
        kmByDay: views.filter((v) => v.result.totalKm > 0).map((v) => ({ dayId: v.day.id, km: v.result.totalKm, label: `วัน ${v.day.day_index}` })),
        manualItemIds: new Set(manual.map((l) => l.trip_item_id).filter(Boolean) as string[]),
        manualFuelDays: new Set(manual.filter((l) => l.category_id === fuelCat && l.day_id).map((l) => l.day_id as string)),
      });
      await replaceAutoRows(trip.id, user.id, rows, cats);
      setLines(await fetchBudgetItems(trip.id));
      toast(`คำนวณแล้ว ${rows.length} รายการ`, 'success');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); setConfirmCalc(false); }
  };

  const saveLine = async (v: BudgetItemInput, lineId: string | null) => {
    if (lineId) {
      await updateBudgetItem(lineId, v);
      setLines((xs) => xs.map((l) => (l.id === lineId ? { ...l, ...v, is_auto: false } : l)));
    } else {
      const created = await addBudgetItem(trip.id, user.id, v);
      setLines((xs) => [...xs, created]);
    }
    toast('บันทึกแล้ว', 'success');
  };

  const removeLine = async (lineId: string) => {
    await deleteBudgetItem(lineId);
    setLines((xs) => xs.filter((l) => l.id !== lineId));
    toast('ลบแล้ว', 'success');
  };

  const saveSettings = async (v: BudgetSettings) => {
    await updateTrip(trip.id, v);
    setTrip({ ...trip, ...v });
    toast('บันทึกแล้ว — กด “คำนวณจากแผน” เพื่ออัปเดตค่าน้ำมัน/อาหาร', 'success');
  };

  // ---------- groups ----------
  const byCat = groupBy(lines, (l) => l.category_id)
    .sort((a, b) => (catById.get(a.key)?.sort_order ?? 99) - (catById.get(b.key)?.sort_order ?? 99));
  const byDay = groupBy(lines, (l) => l.day_id ?? '')
    .sort((a, b) => (dayById.get(a.key)?.day_index ?? 999) - (dayById.get(b.key)?.day_index ?? 999));
  const maxCat = Math.max(1, ...byCat.map((g) => Math.max(g.estimated, g.actual)));
  const settle = settlement(lines, members.map((m) => m.id));

  const lineRow = (l: BudgetItem) => {
    const c = catById.get(l.category_id);
    const over = l.actual != null && l.estimated > 0 && l.actual > l.estimated;
    return (
      <li key={l.id}>
        <button type="button" onClick={() => setSheet({ item: l, spend: false })} className="flex w-full items-center gap-3 py-2 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: c?.color ?? '#64748B' }}>
            <BudgetIcon name={c?.icon} size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{l.label}</span>
            <span className="block text-xs text-muted">
              {l.day_id && dayById.get(l.day_id) ? `วัน ${dayById.get(l.day_id)!.day_index}` : 'ทั้งทริป'}
              {!l.is_shared && ' · ส่วนตัว'}
              {l.is_auto && ' · อัตโนมัติ'}
              {l.paid_by && members.length > 1 && ` · ${memberName.get(l.paid_by) ?? ''} จ่าย`}
            </span>
          </span>
          <span className="shrink-0 text-right text-sm">
            <span className="block text-muted">{l.estimated ? baht(l.estimated) : '—'}</span>
            <span className={`block font-semibold ${over ? 'text-red-600' : ''}`}>{l.actual != null ? baht(l.actual) : ''}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2">
        <Link to={`/trips/${trip.id}`} aria-label="กลับ" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><ArrowLeft /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">งบประมาณ</h1>
          <p className="truncate text-xs text-muted">{trip.name} · {trip.travelers} คน</p>
        </div>
        <button type="button" aria-label="ตั้งค่างบประมาณ" onClick={() => setSettings(true)} className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-surface-2"><Settings /></button>
      </header>

      {/* summary */}
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted">งบทั้งหมด</p>
            {limit ? <p className="text-2xl font-bold">{baht(limit)}</p>
              : <button type="button" onClick={() => setSettings(true)} className="text-lg font-semibold text-primary underline">ตั้งงบ</button>}
          </div>
          <span className="rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: STATUS_COLOR[headStatus] }}>
            {STATUS_TEXT[headStatus]}
          </span>
        </div>
        <Bar label={`ประมาณการ + สำรอง ${trip.reserve_pct ?? 0}%`} value={s.plannedWithReserve} limit={limit} status={s.planStatus} />
        <Bar label="ใช้จริงแล้ว" value={s.actual} limit={limit} status={s.spendStatus} />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-2"><p className="text-xs text-muted">คงเหลือ</p><p className={`font-bold ${s.remaining != null && s.remaining < 0 ? 'text-red-600' : ''}`}>{s.remaining != null ? baht(s.remaining) : '—'}</p></div>
          <div className="rounded-xl bg-surface-2 p-2"><p className="text-xs text-muted">หารต่อคน</p><p className="font-bold">{baht(s.perPersonShared)}</p></div>
          <div className="rounded-xl bg-surface-2 p-2"><p className="text-xs text-muted">ส่วนตัวรวม</p><p className="font-bold">{baht(s.personal)}</p></div>
        </div>
        <p className="flex items-start gap-1 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          ทุกค่าเป็นค่าประมาณ แก้ไขได้{usesFuel ? ` · น้ำมัน ${fp.kmPerL} กม./ลิตร × ฿${fp.pricePerL}/ลิตร × ${fp.vehicles} คัน (ระยะทางจากเส้นทางแนะนำเบื้องต้น)` : ''} · อาหาร ฿{Number(trip.meal_cost_pp ?? 0)}/คน/มื้อ
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<Calculator size={18} />} disabled={busy} onClick={() => (autoCount ? setConfirmCalc(true) : void recalc())}>
          {busy ? 'กำลังคำนวณ…' : 'คำนวณจากแผน'}
        </Button>
        <Button icon={<Receipt size={18} />} onClick={() => setSheet({ item: null, spend: true })}>บันทึกจ่ายจริง</Button>
      </div>

      {lines.length === 0 ? (
        <EmptyState icon={<Wallet size={40} />} title="ยังไม่มีรายการงบ" text="กด “คำนวณจากแผน” เพื่อประมาณค่าน้ำมัน ค่าเข้า อาหาร และที่พักจาก Timeline" />
      ) : (
        <>
          <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-line bg-surface text-sm" role="tablist">
            {([['category', 'หมวด'], ['day', 'รายวัน'], ['list', 'รายการ'], ['paid', 'ใครจ่าย']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`min-h-11 ${tab === k ? 'bg-primary text-on-primary' : ''}`}>{l}</button>
            ))}
          </div>

          {tab === 'category' && (
            <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
              <p className="flex justify-end gap-4 text-xs text-muted"><span>▮ ประมาณ</span><span className="font-semibold">▮ จริง</span></p>
              {byCat.map((g) => {
                const c = catById.get(g.key);
                return (
                  <div key={g.key}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span style={{ color: c?.color }}><BudgetIcon name={c?.icon} size={16} /></span>
                      <span className="flex-1">{c?.name_th ?? 'อื่นๆ'}</span>
                      <span className="text-muted">{baht(g.estimated)}</span>
                      <span className={`w-20 text-right font-semibold ${g.actual > g.estimated && g.estimated > 0 ? 'text-red-600' : ''}`}>{g.actual ? baht(g.actual) : '—'}</span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="absolute inset-y-0 left-0 rounded-full opacity-35" style={{ width: `${(g.estimated / maxCat) * 100}%`, background: c?.color }} />
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(g.actual / maxCat) * 100}%`, background: c?.color }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold">
                <span>รวม</span><span>{baht(s.estimated)} · จริง {baht(s.actual)}</span>
              </div>
              {s.reserve > 0 && <p className="text-right text-xs text-muted">+ สำรอง {trip.reserve_pct}% = {baht(s.reserve)}</p>}
            </section>
          )}

          {tab === 'day' && (
            <section className="space-y-2">
              {byDay.map((g) => {
                const d = dayById.get(g.key);
                return (
                  <div key={g.key || 'all'} className="rounded-2xl border border-line bg-surface p-3">
                    <div className="flex items-baseline justify-between">
                      <p className="font-semibold">{d ? `วัน ${d.day_index}${d.date ? ` · ${fmtDateTh(d.date)}` : ''}` : 'ทั้งทริป'}</p>
                      <p className="text-sm"><span className="text-muted">{baht(g.estimated)}</span> · <b>{baht(g.actual)}</b></p>
                    </div>
                    <ul className="divide-y divide-line">{lines.filter((l) => (l.day_id ?? '') === g.key).map(lineRow)}</ul>
                  </div>
                );
              })}
            </section>
          )}

          {tab === 'list' && (
            <section className="rounded-2xl border border-line bg-surface px-3">
              <p className="flex justify-end gap-6 pt-2 text-xs text-muted"><span>ประมาณ</span><span>จริง</span></p>
              <ul className="divide-y divide-line">{lines.map(lineRow)}</ul>
            </section>
          )}

          {tab === 'paid' && (
            <section className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-sm">
              {members.length < 2 ? (
                <p className="text-muted">ชวนสมาชิกเข้าทริป (ตั้งค่าทริป → ชวนคนร่วมวางแผน) เพื่อแบ่งว่าใครจ่ายเท่าไร</p>
              ) : (
                <>
                  <p className="text-xs text-muted">คิดจากค่าใช้จ่ายจริงแบบ “หารร่วมกัน” ที่ระบุคนจ่าย แบ่งเท่ากันระหว่างสมาชิก {members.length} คนในแอป</p>
                  {settle.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-xl bg-surface-2 p-3">
                      <span className="font-medium">{memberName.get(r.id)}</span>
                      <span className="text-right">
                        จ่ายไป {baht(r.paid)}<br />
                        <span className={r.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {r.balance === 0 ? 'พอดี' : r.balance > 0 ? `ได้คืน ${baht(r.balance)}` : `ต้องจ่ายเพิ่ม ${baht(-r.balance)}`}
                        </span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </section>
          )}
        </>
      )}

      <Button variant="ghost" className="w-full border border-line" icon={<Plus size={18} />} onClick={() => setSheet({ item: null, spend: false })}>
        เพิ่มรายการประมาณการ
      </Button>

      <BudgetItemSheet open={sheet !== null} item={sheet?.item ?? null} spendMode={sheet?.spend ?? false}
        categories={cats} days={days} members={members} currentUserId={user.id}
        defaultDayId={days.find((d) => d.date === new Date().toISOString().slice(0, 10))?.id ?? null}
        onClose={() => setSheet(null)} onSave={saveLine} onDelete={removeLine} />
      <BudgetSettingsSheet open={settings} trip={trip} defaults={defaults} onClose={() => setSettings(false)} onSave={saveSettings} />
      <ConfirmDialog open={confirmCalc} busy={busy} title="คำนวณจากแผนใหม่?" confirmText="คำนวณ"
        message={`รายการอัตโนมัติ ${autoCount} รายการจะถูกคำนวณใหม่จาก Timeline ปัจจุบัน\nรายการที่เพิ่มหรือแก้ไขเองจะไม่ถูกเปลี่ยน`}
        onCancel={() => setConfirmCalc(false)} onConfirm={() => void recalc()} />
    </div>
  );
}
