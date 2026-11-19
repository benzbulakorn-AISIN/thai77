import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Download, LogIn, Luggage, TriangleAlert } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { useReference } from '../features/provinces/useGeoData';
import { listTrips, loadTrip, type TripSummary } from '../features/trips/tripsApi';
import { dominantRegion } from '../features/trips/tripCoverModel';
import { regionColor } from '../features/covers/regionColors';
import { fmtDateTh, todayIso } from '../features/routing/time';
import {
  MAX_LANES, WEEKDAYS, buildCalendarParams, buildMonthGrid, dayLabel, dayProgress, monthOfDate, monthTitle, parseCalendarParams,
  shiftMonth, thaiLongDate, tripsInMonth, tripsOnDay, weekSegments,
} from '../features/calendar/calendarModel';
import { buildAllTripsIcs, buildTripIcs, downloadIcs, icsFileName } from '../features/calendar/tripIcs';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

const BAR_H = 18; // px
const CELL_MIN_H = 30 + MAX_LANES * (BAR_H + 2) + 14;

export function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const { provinces, regions } = useReference();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const { month, selected: selectedParam } = useMemo(() => parseCalendarParams(params, today), [params, today]);
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listTrips().then(setTrips).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  const weeks = useMemo(() => buildMonthGrid(month), [month]);
  const colorOf = useCallback(
    (t: TripSummary) => regionColor(dominantRegion(t.province_ids, provinces, regions)),
    [provinces, regions],
  );
  const colorById = useMemo(() => new Map((trips ?? []).map((t) => [t.id, colorOf(t)])), [trips, colorOf]);

  const selected = selectedParam ?? (monthOfDate(today) === month ? today : null);
  const dayTrips = selected ? tripsOnDay(trips ?? [], selected) : [];
  const monthTrips = useMemo(() => tripsInMonth(trips ?? [], month), [trips, month]);

  const go = (next: { month?: string; selected?: string | null }) => {
    setParams(buildCalendarParams({ month: next.month ?? month, selected: next.selected === undefined ? null : next.selected }), { replace: true });
  };
  const pickDay = (date: string) => go({ month: monthOfDate(date), selected: date === selected && selectedParam ? null : date });

  const exportAll = () => {
    if (!trips?.length) return;
    try {
      downloadIcs(icsFileName('ทริปทั้งหมด', today), buildAllTripsIcs(trips));
      toast(`ส่งออก ${trips.length} ทริปแล้ว`, 'success');
    } catch { toast('ส่งออกไม่สำเร็จ ลองใหม่', 'error'); }
  };

  const exportTrip = async (t: TripSummary) => {
    setBusyId(t.id);
    try {
      const r = await loadTrip(t.id);
      if (!r) throw new Error('ไม่พบทริป');
      downloadIcs(icsFileName(r.trip.name, r.trip.start_date), buildTripIcs(r.trip, r.days, r.items));
      toast('ส่งออก Timeline แล้ว — เปิดไฟล์เพื่อเพิ่มลงปฏิทิน', 'success');
    } catch (e) { toast((e as Error).message || 'ส่งออกไม่สำเร็จ', 'error'); }
    finally { setBusyId(null); }
  };

  if (authLoading) return <Skeleton className="h-64" />;
  if (!user) {
    return (
      <EmptyState icon={<CalendarDays size={40} />} title="เข้าสู่ระบบเพื่อดูปฏิทินทริป"
        action={<Link to="/auth/login"><Button icon={<LogIn size={20} />}>เข้าสู่ระบบ</Button></Link>} />
    );
  }

  const tripRow = (t: TripSummary, withDay: boolean) => {
    const prog = selected && withDay ? dayProgress(t, selected) : null;
    return (
      <li key={t.id} className="rounded-2xl border border-line bg-surface p-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: colorById.get(t.id) }} />
          <div className="min-w-0 flex-1">
            <Link to={`/trips/${t.id}`} className="block truncate font-semibold">{t.name}</Link>
            <p className="text-xs text-muted">
              {fmtDateTh(t.start_date)} – {fmtDateTh(t.end_date, true)}{prog ? ` · วันที่ ${prog.day}/${prog.total}` : ''}
            </p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link to={`/trips/${t.id}`} className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm">เปิดทริป</Link>
          <button type="button" disabled={busyId === t.id} onClick={() => void exportTrip(t)}
            className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-primary text-sm text-primary disabled:opacity-50">
            <Download size={16} /> {busyId === t.id ? 'กำลังสร้าง…' : 'ส่งออก .ics'}
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/trips" aria-label="กลับไปทริป" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><ArrowLeft /></Link>
        <h1 className="flex-1 text-2xl font-bold">ปฏิทินทริป</h1>
        <button type="button" onClick={exportAll} disabled={!trips?.length}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-primary px-3 text-sm text-primary disabled:opacity-40">
          <Download size={18} /> ส่งออกทุกทริป
        </button>
      </header>

      {error && (
        <EmptyState icon={<TriangleAlert size={36} />} title={error} action={<Button onClick={load}>ลองใหม่</Button>} />
      )}
      {!error && !trips && <Skeleton className="h-96" />}

      {!error && trips && (
        <>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => go({ month: shiftMonth(month, -1) })}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface"><ChevronLeft /></button>
            <h2 className="flex-1 text-center text-lg font-semibold" aria-live="polite">{monthTitle(month)}</h2>
            <button type="button" onClick={() => go({ month: monthOfDate(today), selected: today })}
              className="min-h-12 rounded-xl border border-line bg-surface px-3 text-sm">วันนี้</button>
            <button type="button" aria-label="เดือนถัดไป" onClick={() => go({ month: shiftMonth(month, 1) })}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface"><ChevronRight /></button>
          </div>

          <div role="group" aria-label={`ปฏิทิน ${monthTitle(month)}`} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-xs text-muted">
              {WEEKDAYS.map((w, i) => <div key={w} className={`py-2 ${i === 0 ? 'text-red-600' : ''}`}>{w}</div>)}
            </div>
            {weeks.map((week) => {
              const { segments, hidden } = weekSegments(trips, week[0], MAX_LANES);
              return (
                <div key={week[0]} className="relative border-b border-line last:border-b-0">
                  <div className="grid grid-cols-7">
                    {week.map((date, col) => {
                      const inMonth = monthOfDate(date) === month;
                      const isToday = date === today;
                      const isSel = date === selected;
                      const list = tripsOnDay(trips, date);
                      return (
                        <button key={date} type="button" onClick={() => pickDay(date)} aria-pressed={isSel}
                          aria-current={isToday ? 'date' : undefined} aria-label={dayLabel(date, list)}
                          style={{ minHeight: CELL_MIN_H }}
                          className={`relative flex flex-col items-start border-r border-line px-1 pt-1 text-left last:border-r-0 ${isSel ? 'bg-primary/10 ring-2 ring-inset ring-primary' : ''} ${inMonth ? '' : 'opacity-45'}`}>
                          <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${isToday ? 'bg-primary font-bold text-on-primary' : col === 0 ? 'text-red-600' : ''}`}>
                            {Number(date.slice(8))}
                          </span>
                          {hidden[col] > 0 && <span className="mt-auto pb-0.5 text-[10px] font-medium text-muted">+{hidden[col]}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[30px] grid grid-cols-7 gap-y-[2px] px-[2px]"
                    style={{ gridAutoRows: `${BAR_H}px` }}>
                    {segments.map((s) => (
                      <div key={`${s.tripId}-${s.lane}`}
                        style={{ gridColumn: `${s.startCol + 1} / ${s.endCol + 2}`, gridRow: s.lane + 1, background: colorById.get(s.tripId) }}
                        className={`truncate px-1.5 text-[10px] font-medium leading-[18px] text-white ${s.continuesLeft ? 'rounded-l-none' : 'rounded-l-md'} ${s.continuesRight ? 'rounded-r-none' : 'rounded-r-md'}`}>
                        {s.name}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <section aria-label={selected ? thaiLongDate(selected) : 'ทริปในเดือนนี้'} className="space-y-2" aria-live="polite">
            {selected ? (
              <>
                <h2 className="font-semibold">{thaiLongDate(selected)}</h2>
                {dayTrips.length === 0
                  ? <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">ไม่มีทริปในวันนี้</p>
                  : <ul className="space-y-2">{dayTrips.map((t) => tripRow(t, true))}</ul>}
              </>
            ) : (
              <>
                <h2 className="font-semibold">ทริปในเดือนนี้ <span className="text-sm font-normal text-muted">({monthTrips.length})</span></h2>
                {monthTrips.length === 0
                  ? <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">ไม่มีทริปในเดือนนี้</p>
                  : <ul className="space-y-2">{monthTrips.map((t) => tripRow(t, false))}</ul>}
              </>
            )}
          </section>

          {trips.length === 0 && (
            <EmptyState icon={<Luggage size={36} />} title="ยังไม่มีทริป" text="สร้างทริปแล้วจะมาปรากฏในปฏิทินนี้"
              action={<Link to="/explore" className="text-primary underline">ไปเลือกสถานที่</Link>} />
          )}
          <p className="text-xs text-muted">ไฟล์ .ics ใช้เพิ่มทริปลง Google / Apple / Outlook Calendar ได้ — เวลาในไฟล์เป็นค่าประมาณจากแผน ไม่รวมจุดเริ่มต้นทริป และไม่รวมงบประมาณ</p>
        </>
      )}
    </div>
  );
}
