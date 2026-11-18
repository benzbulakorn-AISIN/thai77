import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, Copy, Coffee, List, Map as MapIcon, Plus, Route, Settings, TriangleAlert, Users, Rows3, Wallet,
} from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import {
  changeTripDates, deleteItems, deleteTrip, insertItems, loadTrip, saveOrder, updateDay, updateItem, updateTrip, type NewItem,
} from '../features/trips/tripsApi';
import { byOrder, computeTrip, replanTrip, type DayView } from '../features/trips/schedule';
import { TimelineView } from '../features/trips/TimelineView';
import { ItemSheet, type ItemPatch } from '../features/trips/ItemSheet';
import { AddItemSheet } from '../features/trips/AddItemSheet';
import { TripSettingsSheet, type TripSettings } from '../features/trips/TripSettingsSheet';
import { RouteMap, type RoutePoint } from '../features/trips/RouteMap';
import { ItemIcon } from '../features/trips/itemIcons';
import { MODE_LABEL } from '../features/routing/provider';
import { speedNote } from '../features/routing/scheduler';
import { fmtDateTh, fmtDuration, fmtMin } from '../features/routing/time';
import type { Trip, TripDay, TripItem } from '../features/trips/types';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

type ViewMode = 'timeline' | 'list' | 'map';
const UNSCHEDULED = 'unscheduled';

export function TripPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<TripDay[]>([]);
  const [items, setItems] = useState<TripItem[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [tab, setTab] = useState<string>('');
  const [mode, setMode] = useState<ViewMode>('timeline');
  const [editing, setEditing] = useState<TripItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const [confirmReplan, setConfirmReplan] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const r = await loadTrip(id);
      if (!r) { setState('missing'); return; }
      setTrip(r.trip); setDays(r.days); setItems(r.items); setState('ok');
      setTab((t) => (t && (t === UNSCHEDULED || r.days.some((d) => d.id === t)) ? t : r.days[0]?.id ?? UNSCHEDULED));
    } catch { setState('error'); }
  }, [id]);
  useEffect(() => { void reload(); }, [reload]);

  const views = useMemo(() => (trip ? computeTrip(trip, days, items) : []), [trip, days, items]);
  const unscheduled = useMemo(() => items.filter((i) => !i.day_id || !days.some((d) => d.id === i.day_id)).sort(byOrder), [items, days]);

  if (state === 'loading') return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;
  if (state === 'missing') return <EmptyState icon={<Route size={40} />} title="ไม่พบทริปนี้" text="อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง" action={<Link to="/trips" className="text-primary underline">กลับรายการทริป</Link>} />;
  if (state === 'error' || !trip) return <EmptyState icon={<TriangleAlert size={40} />} title="โหลดทริปไม่สำเร็จ" action={<Button onClick={() => void reload()}>ลองใหม่</Button>} />;

  const isOwner = trip.owner_id === user?.id;
  const view: DayView | undefined = views.find((v) => v.day.id === tab);
  const totalKm = views.reduce((s, v) => s + v.result.totalKm, 0);
  const totalTravel = views.reduce((s, v) => s + v.result.totalTravelMin, 0);
  const warnCount = views.reduce((s, v) => s + v.result.entries.filter((e) => e.warnings.length).length + (v.result.overflowMin > 0 ? 1 : 0), 0);

  // ---------- mutations (optimistic where cheap) ----------
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast(ok, 'success'); } catch (e) { toast((e as Error).message || 'ไม่สำเร็จ', 'error'); await reload(); }
  };

  const reorder = (dayId: string, ids: string[]) => {
    const pos = new Map(ids.map((x, i) => [x, i * 10]));
    setItems((s) => s.map((i) => (pos.has(i.id) ? { ...i, sort_order: pos.get(i.id) as number } : i)));
    void run(() => saveOrder(ids.map((x, i) => ({ id: x, day_id: dayId, sort_order: i * 10 }))));
  };

  const saveItem = async (itemId: string, patch: ItemPatch) => {
    const cur = items.find((i) => i.id === itemId);
    const p: ItemPatch & { sort_order?: number } = { ...patch };
    if (cur && patch.day_id !== undefined && patch.day_id !== cur.day_id) {
      const max = Math.max(0, ...items.filter((i) => i.day_id === patch.day_id).map((i) => i.sort_order));
      p.sort_order = max + 10;
    }
    await updateItem(itemId, { ...p, is_auto: false });
    setItems((s) => s.map((i) => (i.id === itemId ? { ...i, ...p, is_auto: false } : i)));
    toast('บันทึกแล้ว', 'success');
  };

  const removeItem = async (itemId: string) => {
    await deleteItems([itemId]);
    setItems((s) => s.filter((i) => i.id !== itemId));
    toast('ลบแล้ว', 'success');
  };

  const addItem = async (row: Omit<NewItem, 'trip_id' | 'day_id' | 'sort_order'>) => {
    const dayId = tab === UNSCHEDULED ? null : tab;
    const max = Math.max(0, ...items.filter((i) => i.day_id === dayId).map((i) => i.sort_order));
    const [created] = await insertItems([{ ...row, trip_id: trip.id, day_id: dayId, sort_order: max + 10 }]);
    if (created) setItems((s) => [...s, created]);
    toast('เพิ่มแล้ว', 'success');
  };

  const copyPrev = (day: TripDay) => {
    const prev = days.find((d) => d.day_index === day.day_index - 1);
    if (!prev) return;
    const src = items.filter((i) => i.day_id === prev.id).sort(byOrder);
    if (!src.length) { toast('วันก่อนหน้ายังไม่มีกิจกรรม', 'info'); return; }
    const base = Math.max(0, ...items.filter((i) => i.day_id === day.id).map((i) => i.sort_order));
    void run(async () => {
      const rows: NewItem[] = src.map((i, k) => ({
        trip_id: trip.id, day_id: day.id, item_type: i.item_type, title: i.title, place_id: i.place_id, lat: i.lat, lng: i.lng,
        sort_order: base + (k + 1) * 10, duration_min: i.duration_min, start_time: i.start_time, is_locked_time: i.is_locked_time,
        est_cost: i.est_cost, is_auto: false, notes: i.notes,
      }));
      const created = await insertItems(rows);
      setItems((s) => [...s, ...created]);
    }, `คัดลอก ${src.length} รายการแล้ว`);
  };

  const toggleRest = (day: TripDay) => void run(async () => {
    await updateDay(day.id, { is_rest_day: !day.is_rest_day });
    setDays((s) => s.map((d) => (d.id === day.id ? { ...d, is_rest_day: !d.is_rest_day } : d)));
  }, day.is_rest_day ? 'ยกเลิกวันพักแล้ว' : 'ตั้งเป็นวันพัก — จัดเส้นทางใหม่จะไม่ใส่สถานที่ในวันนี้');

  const setDayStart = (day: TripDay, v: string) => {
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    void run(async () => {
      await updateDay(day.id, { start_time: `${v}:00` });
      setDays((s) => s.map((d) => (d.id === day.id ? { ...d, start_time: `${v}:00` } : d)));
    });
  };

  const doReplan = async () => {
    setBusy(true);
    try {
      const plan = await replanTrip(trip, days, items);
      await reload();
      toast(plan.unscheduled.length ? `จัดแล้ว · เหลือ ${plan.unscheduled.length} แห่งที่ยังไม่ได้จัดวัน` : 'จัดเส้นทางใหม่แล้ว', 'success');
    } catch (e) { toast((e as Error).message, 'error'); await reload(); }
    finally { setBusy(false); setConfirmReplan(false); }
  };

  const saveSettings = async (s: TripSettings) => {
    await updateTrip(trip.id, {
      name: s.name, travelers: s.travelers, mode: s.mode, day_start_time: `${s.day_start_time}:00`,
      day_end_time: `${s.day_end_time}:00`, road_factor: s.road_factor,
    });
    if (s.start_date !== trip.start_date || s.end_date !== trip.end_date) await changeTripDates(trip, days, s.start_date, s.end_date);
    await reload();
    toast('บันทึกแล้ว', 'success');
  };

  // ---------- map points for the selected day ----------
  const mapPoints: RoutePoint[] = (() => {
    if (!view) return [];
    const pts: RoutePoint[] = [];
    if (view.day.day_index === 1 && trip.start_point) pts.push({ ...trip.start_point, kind: 'start' });
    let n = 0;
    view.items.forEach((i) => { if (i.lat != null && i.lng != null) pts.push({ lat: i.lat, lng: i.lng, label: i.title, kind: 'stop', n: ++n }); });
    if (view.destinationLabel && trip.end_point) pts.push({ ...trip.end_point, kind: 'end' });
    return pts;
  })();

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2">
        <Link to="/trips" aria-label="กลับ" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><ArrowLeft /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">{trip.name}</h1>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {fmtDateTh(trip.start_date)} – {fmtDateTh(trip.end_date, true)}</span>
            <span className="inline-flex items-center gap-1"><Users size={12} /> {trip.travelers} คน · {MODE_LABEL[trip.mode]}</span>
          </p>
        </div>
        <Link to={`/trips/${trip.id}/budget`} aria-label="งบประมาณ" className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-surface-2"><Wallet /></Link>
        <button type="button" aria-label="ตั้งค่าทริป" onClick={() => setSettings(true)} className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-surface-2"><Settings /></button>
      </header>

      <section className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-2xl border border-line bg-surface p-2"><p className="text-lg font-bold text-primary">~{totalKm.toFixed(0)}</p><p className="text-xs text-muted">กม. รวม</p></div>
        <div className="rounded-2xl border border-line bg-surface p-2"><p className="text-lg font-bold text-primary">{fmtDuration(totalTravel)}</p><p className="text-xs text-muted">เดินทางรวม</p></div>
        <div className="rounded-2xl border border-line bg-surface p-2"><p className={`text-lg font-bold ${warnCount ? 'text-red-600' : 'text-green-600'}`}>{warnCount}</p><p className="text-xs text-muted">คำเตือน</p></div>
        <Link to={`/trips/${trip.id}/budget`} className="rounded-2xl border border-line bg-surface p-2"><p className="flex justify-center text-lg font-bold text-primary"><Wallet size={22} /></p><p className="text-xs text-muted">งบประมาณ</p></Link>
      </section>
      <p className="text-xs text-muted">ⓘ เส้นทางแนะนำเบื้องต้น — {speedNote(trip.mode, Number(trip.road_factor) || 1.3)} ไม่ใช่เส้นทางถนนจริง</p>

      {unscheduled.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="flex-1 text-sm">มี {unscheduled.length} รายการที่ยังไม่จัดวัน</p>
          <Button icon={<Route size={18} />} disabled={busy} onClick={() => setConfirmReplan(true)}>จัดเส้นทางและสร้างแผนเที่ยว</Button>
        </div>
      )}

      {/* view switch */}
      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-surface" role="tablist">
        {([['timeline', 'Timeline', Rows3], ['list', 'รายการ', List], ['map', 'แผนที่', MapIcon]] as const).map(([k, l, I]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
            className={`flex min-h-11 items-center justify-center gap-1 text-sm ${mode === k ? 'bg-primary text-on-primary' : ''}`}><I size={16} /> {l}</button>
        ))}
      </div>

      {mode === 'list' ? (
        <section className="space-y-4">
          {views.map((v) => (
            <div key={v.day.id} className="rounded-2xl border border-line bg-surface p-3">
              <p className="mb-2 font-semibold">วัน {v.day.day_index}{v.day.date ? ` · ${fmtDateTh(v.day.date)}` : ''}{v.day.is_rest_day ? ' · วันพัก' : ''}</p>
              {v.items.length === 0 ? <p className="text-sm text-muted">ยังไม่มีกิจกรรม</p> : (
                <ul className="space-y-1 text-sm">
                  {v.items.map((i, k) => (
                    <li key={i.id} className="flex gap-2">
                      <span className="w-24 shrink-0 tabular-nums text-muted">{fmtMin(v.result.entries[k].start)}–{fmtMin(v.result.entries[k].end)}</span>
                      <span className={v.result.entries[k].warnings.length ? 'text-red-600' : ''}>{i.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted">~{v.result.totalKm.toFixed(0)} กม. · เดินทาง ~{fmtDuration(v.result.totalTravelMin)} · จบ {fmtMin(v.result.finish)}</p>
            </div>
          ))}
        </section>
      ) : (
        <>
          {/* day tabs */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {days.map((d) => {
              const v = views.find((x) => x.day.id === d.id);
              const warn = v && (v.result.overflowMin > 0 || v.result.entries.some((e) => e.warnings.length));
              return (
                <button key={d.id} type="button" onClick={() => setTab(d.id)}
                  className={`min-h-12 shrink-0 rounded-xl border px-3 text-left text-sm ${tab === d.id ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>
                  <span className="block font-semibold">วัน {d.day_index}{warn ? ' ⚠️' : ''}{d.is_rest_day ? ' 🛌' : ''}</span>
                  <span className="block text-xs opacity-80">{d.date ? fmtDateTh(d.date) : ''}</span>
                </button>
              );
            })}
            {unscheduled.length > 0 && (
              <button type="button" onClick={() => setTab(UNSCHEDULED)}
                className={`min-h-12 shrink-0 rounded-xl border px-3 text-sm ${tab === UNSCHEDULED ? 'border-primary bg-primary text-on-primary' : 'border-amber-400 bg-surface'}`}>
                ยังไม่จัด ({unscheduled.length})
              </button>
            )}
          </div>

          {tab === UNSCHEDULED ? (
            <section className="space-y-2">
              {unscheduled.map((i) => (
                <button key={i.id} type="button" onClick={() => setEditing(i)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left">
                  <ItemIcon type={i.item_type} />
                  <span className="flex-1">{i.title}</span>
                  <span className="text-xs text-muted">{i.lat == null ? 'ไม่มีพิกัด' : 'เวลาไม่พอ'}</span>
                </button>
              ))}
              <p className="text-xs text-muted">แตะเพื่อเลือกวันเอง หรือเพิ่มจำนวนวัน/ขยายเวลาเลิกเที่ยว แล้วกดจัดเส้นทางใหม่</p>
            </section>
          ) : view ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="inline-flex items-center gap-2">ออก
                  <input type="time" className="input min-h-10 w-28" defaultValue={(view.day.start_time ?? trip.day_start_time).slice(0, 5)}
                    key={`${view.day.id}-${view.day.start_time}`} onBlur={(e) => setDayStart(view.day, e.target.value)} />
                </label>
                <button type="button" onClick={() => toggleRest(view.day)}
                  className={`inline-flex min-h-10 items-center gap-1 rounded-full border px-3 ${view.day.is_rest_day ? 'border-primary text-primary' : 'border-line'}`}>
                  <Coffee size={16} /> {view.day.is_rest_day ? 'วันพัก ✓' : 'วันพัก'}
                </button>
                {view.day.day_index > 1 && (
                  <button type="button" onClick={() => copyPrev(view.day)} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-line px-3">
                    <Copy size={16} /> คัดลอกวันก่อน
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => setConfirmReplan(true)} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-line px-3">
                  <Route size={16} /> จัดเส้นทางใหม่
                </button>
              </div>

              {view.result.overflowMin > 0 && (
                <p className="flex items-center gap-2 rounded-xl bg-red-100 p-3 text-sm text-red-800">
                  <TriangleAlert size={16} /> วันนี้แน่นเกินไป เกินเวลาเลิกเที่ยว {fmtDuration(view.result.overflowMin)}
                </p>
              )}

              {mode === 'map' ? (
                mapPoints.length ? <RouteMap points={mapPoints} className="h-[60vh] min-h-[320px]" />
                  : <EmptyState icon={<MapIcon size={36} />} title="ยังไม่มีจุดที่มีพิกัดในวันนี้" />
              ) : view.items.length === 0 ? (
                <EmptyState icon={<CalendarDays size={36} />} title={view.day.is_rest_day ? 'วันพัก 🛌' : 'ยังไม่มีกิจกรรม'} text="เพิ่มกิจกรรม หรือย้ายสถานที่มาวันนี้" />
              ) : (
                <TimelineView view={view} onOpen={setEditing} onReorder={(ids) => reorder(view.day.id, ids)} />
              )}

              <p className="text-xs text-muted">
                วันนี้ ~{view.result.totalKm.toFixed(0)} กม. · เดินทาง ~{fmtDuration(view.result.totalTravelMin)} · จบ {fmtMin(view.result.finish)} · ลาก <b>⋮⋮</b> เพื่อเปลี่ยนลำดับ
              </p>
              <Button className="w-full" icon={<Plus size={20} />} onClick={() => setAdding(true)}>เพิ่มกิจกรรม</Button>
            </section>
          ) : null}
        </>
      )}

      <ItemSheet item={editing} days={days} onClose={() => setEditing(null)} onSave={saveItem} onDelete={removeItem} />
      <AddItemSheet open={adding} onClose={() => setAdding(false)} onAdd={addItem} />
      <TripSettingsSheet open={settings} trip={trip} isOwner={isOwner} onClose={() => setSettings(false)} onSave={saveSettings}
        onDelete={async () => { await deleteTrip(trip.id); toast('ลบทริปแล้ว', 'success'); nav('/trips', { replace: true }); }} />
      <ConfirmDialog open={confirmReplan} busy={busy} title="จัดเส้นทางและสร้างแผนเที่ยวใหม่?" confirmText="จัดใหม่"
        message={'ระบบจะเรียงสถานที่ทั้งหมดใหม่และกระจายไปแต่ละวัน\n• มื้ออาหารอัตโนมัติจะถูกสร้างใหม่\n• กิจกรรมที่เพิ่มเองจะอยู่วันเดิม (ที่ล็อกเวลาไว้จะถูกแทรกตามเวลา)\n• กด “คำนวณจากแผน” ในหน้างบเพื่ออัปเดตค่าใช้จ่าย'}
        onCancel={() => setConfirmReplan(false)} onConfirm={() => void doReplan()} />
    </div>
  );
}
