// Integration: routing -> planner -> scheduler -> budget (the path a user takes from "สร้างแผน" to "งบประมาณ")
import { describe, expect, it } from 'vitest';
import { planTrip, type PlanPlace } from '../../src/features/routing/planner';
import { scheduleDay, type SchedInput } from '../../src/features/routing/scheduler';
import { buildAutoRows } from '../../src/features/budget/estimate';
import { budgetLimit, summarize, type BudgetLine } from '../../src/features/budget/calc';

const home = { lat: 13.75, lng: 100.5 };
const place = (id: string, lat: number, lng: number, extra: Partial<PlanPlace> = {}): PlanPlace => ({
  id, type: 'place', title: id, lat, lng, durationMin: 90, lockedStartMin: null, travelOverrideMin: null, openingHoursText: null, ...extra,
});
const places = [
  place('วัด', 12.93, 100.88, { openingHoursText: '08:00-17:00' }),
  place('หาด', 12.98, 100.92),
  place('ตลาด', 13.28, 100.92),
  place('ถนนคนเดิน', 12.92, 100.86, { openingHoursText: '18:00-02:00' }),
];
const days = [
  { id: 'd1', date: '2026-11-21', startMin: 7 * 60, isRest: false },
  { id: 'd2', date: '2026-11-22', startMin: 8 * 60, isRest: false },
];

/** plan + re-run the scheduler day by day exactly like the Timeline page does */
function simulate(endMin: number) {
  const plan = planTrip(places, days, { start: home, end: home, endMin, mode: 'car', roadFactor: 1.3 });
  let origin: { lat: number; lng: number } | null = home;
  const views = plan.days.map((d, idx) => {
    const seq: SchedInput[] = d.items.map((it) => it.kind === 'place'
      ? places.find((p) => p.id === it.id)!
      : { id: it.title, type: 'meal', title: it.title, lat: null, lng: null, durationMin: it.durationMin, lockedStartMin: null, earliestStartMin: it.earliestMin, travelOverrideMin: null, openingHoursText: null });
    const result = scheduleDay(seq, {
      date: days[idx].date, startMin: days[idx].startMin, endMin, origin,
      destination: idx === plan.days.length - 1 ? home : null, mode: 'car', roadFactor: 1.3,
    });
    origin = result.lastPoint ?? origin;
    return { day: days[idx], seq, result };
  });
  return { plan, views };
}

describe('plan -> schedule -> budget', () => {
  const { plan, views } = simulate(21 * 60);

  it('every place lands on exactly one day and nothing is lost', () => {
    const scheduled = views.flatMap((v) => v.seq.filter((s) => s.type === 'place').map((s) => s.id));
    expect(scheduled.sort()).toEqual(['ตลาด', 'ถนนคนเดิน', 'วัด', 'หาด'].sort());
    expect(plan.unscheduled).toEqual([]);
  });

  it('no day has opening-hour warnings and none overflows', () => {
    for (const v of views) {
      expect(v.result.overflowMin).toBe(0);
      expect(v.result.entries.flatMap((e) => e.warnings)).toEqual([]);
    }
  });

  it('timeline times are strictly increasing within a day', () => {
    for (const v of views) {
      for (let i = 1; i < v.result.entries.length; i++) {
        expect(v.result.entries[i].start).toBeGreaterThanOrEqual(v.result.entries[i - 1].end);
      }
    }
  });

  it('budget: fuel from the real route distance + meals, then status colours', () => {
    const items = views.flatMap((v) => v.seq.map((s, i) => ({
      id: `${v.day.id}-${i}`, day_id: v.day.id, item_type: s.type, title: s.title, est_cost: s.type === 'place' ? 50 : null,
    })));
    const rows = buildAutoRows({
      trip: { travelers: 2, mode: 'car', vehicle_count: 1, fuel_km_per_l: 12, fuel_price_per_l: 40, meal_cost_pp: 150 } as never,
      items: items as never,
      kmByDay: views.map((v) => ({ dayId: v.day.id, km: v.result.totalKm, label: v.day.id })),
      defaults: { kmPerL: 14, pricePerL: 35 }, manualItemIds: new Set(), manualFuelDays: new Set(),
    });
    const fuel = rows.filter((r) => r.slug === 'fuel').reduce((s, r) => s + r.estimated, 0);
    const totalKm = views.reduce((s, v) => s + v.result.totalKm, 0);
    expect(fuel).toBeGreaterThan(0);
    expect(Math.abs(fuel - (totalKm / 12) * 40)).toBeLessThan(views.length); // rounding per day only
    expect(rows.filter((r) => r.slug === 'entry')).toHaveLength(4);
    expect(rows.filter((r) => r.slug === 'food').every((r) => r.estimated === 300)).toBe(true);

    const lines: BudgetLine[] = rows.map((r, i) => ({
      id: String(i), category_id: r.slug, day_id: r.day_id, label: r.label, estimated: r.estimated, actual: null, is_shared: true, paid_by: null, is_auto: true,
    }));
    const limit = budgetLimit(null, 3000, 2);
    const s = summarize(lines, { reservePct: 10, limit, travelers: 2 });
    expect(s.estimated).toBe(lines.reduce((a, l) => a + l.estimated, 0));
    expect(s.plannedWithReserve).toBe(s.estimated + s.reserve);
    expect(['ok', 'near', 'over']).toContain(s.planStatus);
    // a tiny budget must show red, a huge one green
    expect(summarize(lines, { reservePct: 10, limit: 100, travelers: 2 }).planStatus).toBe('over');
    expect(summarize(lines, { reservePct: 10, limit: 10_000_000, travelers: 2 }).planStatus).toBe('ok');
  });
});

describe('tight day end (known limitation, must be visible rather than hidden)', () => {
  it('a lone evening-only place that cannot fit is kept and its overflow is reported', () => {
    const { views } = simulate(20 * 60);
    const overflowing = views.filter((v) => v.result.overflowMin > 0);
    for (const v of overflowing) {
      // the planner only accepts an overflowing day when it holds a single place
      expect(v.seq.filter((s) => s.type === 'place')).toHaveLength(1);
      expect(v.result.overflowMin).toBe(v.result.finish - 20 * 60);
    }
    // and every place is still planned somewhere
    const all = views.flatMap((v) => v.seq.filter((s) => s.type === 'place').map((s) => s.id));
    expect(all.sort()).toEqual(['ตลาด', 'ถนนคนเดิน', 'วัด', 'หาด'].sort());
  });
});
