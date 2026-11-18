import { scheduleDay, type DayResult, type SchedInput } from '../routing/scheduler';
import { planTrip, type PlanPlace } from '../routing/planner';
import { toDbTime, toMin } from '../routing/time';
import type { LatLng } from '../routing/provider';
import { deleteItems, insertItems, saveOrder, saveRoutes, type NewItem } from './tripsApi';
import { DEFAULT_DURATION, type Trip, type TripDay, type TripItem } from './types';

export const byOrder = (a: TripItem, b: TripItem) => a.sort_order - b.sort_order || a.title.localeCompare(b.title);

export function toSchedInput(i: TripItem): SchedInput {
  const t = i.start_time ? toMin(i.start_time) : null;
  return {
    id: i.id,
    type: i.item_type,
    title: i.title,
    lat: i.lat,
    lng: i.lng,
    durationMin: i.duration_min ?? DEFAULT_DURATION[i.item_type],
    lockedStartMin: i.is_locked_time ? t : null,
    earliestStartMin: i.is_locked_time ? null : t,
    travelOverrideMin: i.travel_min_override,
    openingHoursText: i.places?.opening_hours_text ?? null,
  };
}

export const dayStartMin = (trip: Trip, d: TripDay) => toMin(d.start_time ?? trip.day_start_time, 7 * 60);
export const dayEndMin = (trip: Trip) => toMin(trip.day_end_time, 20 * 60);
const pt = (g: Trip['start_point']): LatLng | null => (g && Number.isFinite(g.lat) && Number.isFinite(g.lng) ? { lat: g.lat, lng: g.lng } : null);

export type DayView = { day: TripDay; items: TripItem[]; result: DayResult; originLabel: string | null; destinationLabel: string | null };

/** Times/distances for every day. Each day departs from where the previous day ended. */
export function computeTrip(trip: Trip, days: TripDay[], items: TripItem[]): DayView[] {
  const lastActive = [...days].reverse().find((d) => items.some((i) => i.day_id === d.id)) ?? days[days.length - 1];
  let origin = pt(trip.start_point);
  let originLabel: string | null = trip.start_point?.label ?? null;
  return days.map((day) => {
    const list = items.filter((i) => i.day_id === day.id).sort(byOrder);
    const isLast = day.id === lastActive?.id;
    const dest = isLast ? pt(trip.end_point) : null;
    const result = scheduleDay(list.map(toSchedInput), {
      date: day.date, startMin: dayStartMin(trip, day), endMin: dayEndMin(trip),
      origin, destination: dest, mode: trip.mode, roadFactor: Number(trip.road_factor) || 1.3,
    });
    const view: DayView = { day, items: list, result, originLabel, destinationLabel: isLast ? trip.end_point?.label ?? null : null };
    if (result.lastPoint) {
      origin = result.lastPoint;
      const lastLocated = [...list].reverse().find((i) => i.lat != null && i.lng != null);
      originLabel = lastLocated ? lastLocated.title : originLabel;
    }
    return view;
  });
}

/**
 * "จัดเส้นทางและสร้างแผนเที่ยว": reorder all places over the days, regenerate auto meals,
 * keep user-added activities on their day (timed ones are inserted at the matching time).
 */
export async function replanTrip(trip: Trip, days: TripDay[], items: TripItem[]) {
  const places = items.filter((i) => i.item_type === 'place');
  const inputs: PlanPlace[] = places.map((i) => ({ ...toSchedInput(i), type: 'place', lockedStartMin: null, earliestStartMin: null }));
  const plan = planTrip(inputs, days.map((d) => ({ id: d.id, date: d.date, startMin: dayStartMin(trip, d), isRest: d.is_rest_day })), {
    start: pt(trip.start_point), end: pt(trip.end_point), endMin: dayEndMin(trip), mode: trip.mode, roadFactor: Number(trip.road_factor) || 1.3,
  });

  await deleteItems(items.filter((i) => i.is_auto).map((i) => i.id));

  const updates: { id: string; day_id: string | null; sort_order: number }[] = [];
  const meals: NewItem[] = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  let origin = pt(trip.start_point);

  for (const d of plan.days) {
    const day = days.find((x) => x.id === d.dayId)!;
    // planned sequence as sched inputs (to find where timed custom items belong)
    type Slot = { kind: 'place'; id: string } | { kind: 'meal'; title: string; durationMin: number; earliestMin: number } | { kind: 'custom'; id: string };
    const seq: Slot[] = [...d.items];
    const customs = items.filter((i) => !i.is_auto && i.item_type !== 'place' && i.day_id === d.dayId).sort(byOrder);
    const asInput = (s: Slot): SchedInput => s.kind === 'meal'
      ? { id: `m${s.title}`, type: 'meal', title: s.title, lat: null, lng: null, durationMin: s.durationMin, lockedStartMin: null, earliestStartMin: s.earliestMin, travelOverrideMin: null, openingHoursText: null }
      : toSchedInput(byId.get(s.id)!);
    for (const c of customs) {
      if (!c.start_time) { seq.push({ kind: 'custom', id: c.id }); continue; }
      const r = scheduleDay(seq.map(asInput), { date: day.date, startMin: dayStartMin(trip, day), endMin: dayEndMin(trip), origin, destination: null, mode: trip.mode, roadFactor: Number(trip.road_factor) || 1.3 });
      const t = toMin(c.start_time);
      const at = r.entries.findIndex((e) => e.start >= t);
      seq.splice(at < 0 ? seq.length : at, 0, { kind: 'custom', id: c.id });
    }
    seq.forEach((s, k) => {
      if (s.kind === 'meal') {
        meals.push({ trip_id: trip.id, day_id: d.dayId, item_type: 'meal', title: s.title, duration_min: s.durationMin,
          start_time: toDbTime(s.earliestMin), is_locked_time: false, sort_order: k * 10, is_auto: true });
      } else updates.push({ id: s.id, day_id: d.dayId, sort_order: k * 10 });
    });
    const r = scheduleDay(seq.map(asInput), { date: day.date, startMin: dayStartMin(trip, day), endMin: dayEndMin(trip), origin, destination: null, mode: trip.mode, roadFactor: Number(trip.road_factor) || 1.3 });
    if (r.lastPoint) origin = r.lastPoint;
  }
  plan.unscheduled.forEach((u, k) => updates.push({ id: u.id, day_id: null, sort_order: 10000 + k * 10 }));
  // custom items on rest days / removed days stay where they are
  await saveOrder(updates);
  await insertItems(meals);
  await saveRoutes(trip.id, trip.mode, Number(trip.road_factor) || 1.3, plan.days.map((d) => ({ dayId: d.dayId, km: d.km, min: d.travelMin })));
  return plan;
}
