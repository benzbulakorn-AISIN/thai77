import { orderStops } from './optimizer';
import { scheduleDay, type SchedInput } from './scheduler';
import type { LatLng } from './provider';
import { parseOpeningHours } from './openingHours';
import type { TravelMode } from '../trips/types';

export type PlanPlace = SchedInput & { type: 'place' };
export type PlanDay = { id: string; date: string | null; startMin: number; isRest: boolean };
export type PlannedItem =
  | { kind: 'place'; id: string }
  | { kind: 'meal'; title: string; durationMin: number; earliestMin: number };
export type PlanResult = {
  days: { dayId: string; items: PlannedItem[]; km: number; travelMin: number }[];
  unscheduled: { id: string; reason: 'no_coords' | 'no_time' }[];
};

const LUNCH_FROM = 11 * 60 + 30;
const DINNER_FROM = 17 * 60 + 30;
const MEAL_MIN = 60;

type Opts = { start: LatLng | null; end: LatLng | null; endMin: number; mode: TravelMode; roadFactor: number };

/** place ids + auto meals for one day */
function withMeals(places: PlanPlace[], day: PlanDay, origin: LatLng | null, dest: LatLng | null, o: Opts) {
  const meal = (title: string, earliest: number): SchedInput => ({
    id: `meal:${title}`, type: 'meal', title, lat: null, lng: null, durationMin: MEAL_MIN,
    lockedStartMin: null, earliestStartMin: earliest, travelOverrideMin: null, openingHoursText: null,
  });
  let items: SchedInput[] = [...places];
  const sched = () => scheduleDay(items, { date: day.date, startMin: day.startMin, endMin: o.endMin, origin, destination: dest, mode: o.mode, roadFactor: o.roadFactor });

  // lunch: before the first place that would start at/after 11:30
  let r = sched();
  const li = r.entries.findIndex((e) => e.start >= LUNCH_FROM);
  if (li >= 0) items.splice(li, 0, meal('อาหารกลางวัน', LUNCH_FROM));
  else if (r.finish > LUNCH_FROM + 30 || (r.entries.length && r.entries[r.entries.length - 1].end >= LUNCH_FROM)) items.push(meal('อาหารกลางวัน', LUNCH_FROM));
  // dinner: before the first place starting at/after 17:30, else at the end if the day reaches evening
  r = sched();
  const di = r.entries.findIndex((e, i) => e.start >= DINNER_FROM && items[i].type === 'place');
  if (di >= 0) items.splice(di, 0, meal('อาหารเย็น', DINNER_FROM));
  else {
    const lastEnd = r.entries.length ? r.entries[r.entries.length - 1].end : day.startMin;
    if (lastEnd >= DINNER_FROM - 30) items.push(meal('อาหารเย็น', DINNER_FROM));
  }
  r = sched();
  return { items, result: r };
}

/** opens only in the afternoon/evening on every open day (night markets, walking streets) */
function isEvening(p: PlanPlace) {
  const w = parseOpeningHours(p.openingHoursText);
  if (!w) return false;
  const open = w.filter((r) => r.length);
  return open.length > 0 && open.every((r) => r[0][0] >= 15 * 60);
}

/** Distribute places over days in the suggested order without over-packing. */
export function planTrip(places: PlanPlace[], days: PlanDay[], o: Opts): PlanResult {
  const located = places.filter((p) => p.lat != null && p.lng != null);
  const unscheduled: PlanResult['unscheduled'] = places
    .filter((p) => p.lat == null || p.lng == null)
    .map((p) => ({ id: p.id, reason: 'no_coords' as const }));

  const order = orderStops(located.map((p) => ({ lat: p.lat as number, lng: p.lng as number })), o.start, o.end);
  const queue = order.map((i) => located[i]);
  const out: PlanResult['days'] = [];
  let origin = o.start;
  const workDays = days.filter((d) => !d.isRest);
  const lastWork = workDays[workDays.length - 1];

  for (const day of days) {
    if (day.isRest) { out.push({ dayId: day.id, items: [], km: 0, travelMin: 0 }); continue; }
    const isLast = day === lastWork;
    const dest = isLast ? o.end : null;
    let chosen: PlanPlace[] = [];
    let best = withMeals([], day, origin, dest, o);
    // pass 1: daytime places in suggested order; pass 2: evening-only places at the end of the day
    for (const evening of [false, true]) {
      for (let qi = 0; qi < queue.length; ) {
        const cand = queue[qi];
        if (isEvening(cand) !== evening) { qi++; continue; }
        const trial = [...chosen, cand];
        const res = withMeals(trial, day, origin, dest, o);
        if (res.result.overflowMin > 0 && chosen.length > 0) {
          if (evening) { qi++; continue; } // try another evening place
          break;
        }
        chosen = trial;
        best = res;
        queue.splice(qi, 1);
        if (res.result.overflowMin > 0) break; // single long place: keep it, move on
      }
    }
    out.push({
      dayId: day.id,
      items: best.items.map((it) => (it.type === 'place' ? { kind: 'place', id: it.id } : { kind: 'meal', title: it.title, durationMin: it.durationMin, earliestMin: it.earliestStartMin ?? 0 })),
      km: best.result.totalKm,
      travelMin: best.result.totalTravelMin,
    });
    if (best.result.lastPoint) origin = best.result.lastPoint;
  }
  queue.forEach((p) => unscheduled.push({ id: p.id, reason: 'no_time' }));
  // days with only meals are empty days
  out.forEach((d) => { if (!d.items.some((i) => i.kind === 'place')) d.items = []; });
  return { days: out, unscheduled };
}
