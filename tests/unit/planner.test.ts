import { describe, expect, it } from 'vitest';
import { planTrip, type PlanDay, type PlanPlace } from '../../src/features/routing/planner';
import { scheduleDay, type SchedInput } from '../../src/features/routing/scheduler';

const mk = (id: string, lat: number | null, lng: number | null, hours: string | null = null, dur = 90): PlanPlace => ({
  id, type: 'place', title: id, lat, lng, durationMin: dur, lockedStartMin: null, travelOverrideMin: null, openingHoursText: hours,
});
const home = { lat: 13.75, lng: 100.5 };
const days = (n: number, rest: number[] = []): PlanDay[] =>
  Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}`, date: `2026-11-${21 + i}`, startMin: 7 * 60, isRest: rest.includes(i) }));
const O = { start: home, end: home, endMin: 20 * 60, mode: 'car' as const, roadFactor: 1.3 };

const places: PlanPlace[] = [
  mk('p1', 12.93, 100.88, '08:00-17:00'),
  mk('p2', 12.76, 100.95, 'Tu-Su 09:00-16:00; Mo off'),
  mk('p3', 13.36, 100.98),
  mk('p4', 12.92, 100.86, '18:00-02:00'), // night market
  mk('p5', 12.98, 100.92),
  mk('p6', 13.28, 100.92),
  mk('p7', 12.68, 100.97),
  mk('p8', 13.1, 100.9),
  mk('nocoord', null, null),
];

describe('planTrip', () => {
  const plan = planTrip(places, days(3), O);
  const placeIds = (d: (typeof plan.days)[number]) => d.items.filter((i) => i.kind === 'place').map((i) => (i as { id: string }).id);

  it('puts places without coordinates in "unscheduled" instead of guessing', () => {
    expect(plan.unscheduled.find((u) => u.id === 'nocoord')?.reason).toBe('no_coords');
  });

  it('schedules every located place exactly once or reports it unscheduled', () => {
    const all = plan.days.flatMap(placeIds);
    expect(new Set(all).size).toBe(all.length); // no duplicates
    const unsched = plan.unscheduled.map((u) => u.id);
    for (const p of places.filter((x) => x.lat != null)) {
      expect(all.includes(p.id) !== unsched.includes(p.id)).toBe(true);
    }
  });

  it('inserts lunch and dinner meals with earliest-start times', () => {
    const meals = plan.days.flatMap((d) => d.items.filter((i) => i.kind === 'meal')) as { title: string; earliestMin: number }[];
    expect(meals.length).toBeGreaterThan(0);
    for (const m of meals) expect(m.earliestMin).toBe(m.title.includes('กลางวัน') ? 690 : 1050);
  });

  it('keeps the evening-only market at the end of its day', () => {
    const day = plan.days.find((d) => placeIds(d).includes('p4'));
    expect(day).toBeTruthy();
    const items = day!.items;
    const lastPlace = [...items].reverse().find((i) => i.kind === 'place') as { id: string };
    expect(lastPlace.id).toBe('p4');
  });

  it('never overfills a day (re-simulated with the scheduler)', () => {
    const byId = new Map(places.map((p) => [p.id, p]));
    let origin: { lat: number; lng: number } | null = home;
    plan.days.forEach((d, idx) => {
      if (!d.items.length) return;
      const seq: SchedInput[] = d.items.map((it) => it.kind === 'place'
        ? byId.get(it.id)!
        : { id: it.title, type: 'meal', title: it.title, lat: null, lng: null, durationMin: it.durationMin, lockedStartMin: null, earliestStartMin: it.earliestMin, travelOverrideMin: null, openingHoursText: null });
      const r = scheduleDay(seq, { date: `2026-11-${21 + idx}`, startMin: 420, endMin: 1200, origin, destination: idx === plan.days.length - 1 ? home : null, mode: 'car', roadFactor: 1.3 });
      // a day may only overflow if it holds a single (very long) place
      if (r.overflowMin > 0) expect(seq.filter((s) => s.type === 'place').length).toBe(1);
      origin = r.lastPoint ?? origin;
    });
  });

  it('rest days stay empty', () => {
    const p = planTrip(places, days(3, [1]), O);
    expect(p.days[1].items).toEqual([]);
    expect(p.days[0].items.length + p.days[2].items.length).toBeGreaterThan(0);
  });

  it('reports leftovers as "no_time" when days are too few', () => {
    const p = planTrip(places, days(1), O);
    expect(p.unscheduled.some((u) => u.reason === 'no_time')).toBe(true);
  });

  it('works with no places', () => {
    const p = planTrip([], days(2), O);
    expect(p.days).toHaveLength(2);
    expect(p.days.every((d) => d.items.length === 0)).toBe(true);
    expect(p.unscheduled).toEqual([]);
  });
});
