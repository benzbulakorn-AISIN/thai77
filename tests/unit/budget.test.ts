import { describe, expect, it } from 'vitest';
import { baht, budgetLimit, fuelCost, groupBy, settlement, statusOf, summarize, type BudgetLine } from '../../src/features/budget/calc';
import { buildAutoRows, fuelParams } from '../../src/features/budget/estimate';

const line = (over: Partial<BudgetLine>): BudgetLine => ({
  id: 'x', category_id: 'food', day_id: null, label: 'l', estimated: 0, actual: null, is_shared: true, paid_by: null, is_auto: false, ...over,
});

describe('fuelCost', () => {
  it('km / (km per litre) x price x vehicles', () => {
    expect(fuelCost({ km: 420, kmPerL: 14, pricePerL: 35, vehicles: 1 })).toEqual({ litres: 30, cost: 1050 });
    expect(fuelCost({ km: 210, kmPerL: 14, pricePerL: 35, vehicles: 2 })).toEqual({ litres: 30, cost: 1050 });
  });
  it('invalid inputs give zero, never NaN/Infinity', () => {
    for (const bad of [{ km: 0 }, { kmPerL: 0 }, { pricePerL: -1 }, { vehicles: 0 }, { km: NaN }]) {
      const r = fuelCost({ km: 100, kmPerL: 14, pricePerL: 35, vehicles: 1, ...bad });
      expect(r).toEqual({ litres: 0, cost: 0 });
    }
  });
});

describe('budgetLimit / statusOf', () => {
  it('total wins, per-person x travellers otherwise, null when unset', () => {
    expect(budgetLimit(9000, 5000, 2)).toBe(9000);
    expect(budgetLimit(null, 5000, 2)).toBe(10000);
    expect(budgetLimit(null, 5000, 0)).toBe(5000);
    expect(budgetLimit(null, null, 2)).toBeNull();
    expect(budgetLimit(0, 0, 2)).toBeNull();
  });
  it('green < 80%, yellow 80-100%, red > 100%', () => {
    expect(statusOf(79, 100)).toBe('ok');
    expect(statusOf(80, 100)).toBe('near');
    expect(statusOf(100, 100)).toBe('near');
    expect(statusOf(101, 100)).toBe('over');
    expect(statusOf(5, null)).toBe('none');
    expect(statusOf(5, 0)).toBe('none');
  });
});

describe('summarize', () => {
  const lines = [
    line({ id: '1', category_id: 'fuel', estimated: 1050, actual: 980, paid_by: 'a' }),
    line({ id: '2', estimated: 600 }),
    line({ id: '3', category_id: 'souvenir', estimated: 300, actual: 450, is_shared: false, paid_by: 'b' }),
    line({ id: '4', category_id: 'lodging', estimated: 2000, actual: 2000, paid_by: 'b' }),
  ];
  it('adds reserve, remaining and per-person share', () => {
    const s = summarize(lines, { reservePct: 10, limit: 4000, travelers: 2 });
    expect(s.estimated).toBe(3950);
    expect(s.reserve).toBe(395);
    expect(s.plannedWithReserve).toBe(4345);
    expect(s.actual).toBe(3430);
    expect(s.remaining).toBe(570);
    expect(s.planStatus).toBe('over');
    expect(s.spendStatus).toBe('near');
    expect(s.perPersonShared).toBe(1790); // shared: 980 + 600 + 2000 = 3580 / 2
    expect(s.personal).toBe(450);
  });
  it('no limit -> no remaining, never negative reserve', () => {
    const s = summarize(lines, { reservePct: -5, limit: null, travelers: 2 });
    expect(s.remaining).toBeNull();
    expect(s.reserve).toBe(0);
    expect(s.planStatus).toBe('none');
  });
  it('groupBy totals per key', () => {
    const g = groupBy(lines, (l) => l.category_id);
    expect(g).toHaveLength(4);
    expect(g.find((x) => x.key === 'lodging')).toEqual({ key: 'lodging', estimated: 2000, actual: 2000, count: 1 });
  });
  it('settlement splits shared actuals equally between members', () => {
    expect(settlement(lines, ['a', 'b'])).toEqual([
      { id: 'a', paid: 980, share: 1490, balance: -510 },
      { id: 'b', paid: 2000, share: 1490, balance: 510 },
    ]);
  });
  it('baht formats', () => {
    expect(baht(1234.4)).toContain('1,234');
  });
});

describe('buildAutoRows', () => {
  const trip = { travelers: 2, mode: 'car', vehicle_count: 1, fuel_km_per_l: null, fuel_price_per_l: null, meal_cost_pp: 150 } as never;
  const item = (o: Record<string, unknown>) => ({ day_id: 'd1', est_cost: null, ...o }) as never;
  const base = {
    trip,
    kmByDay: [{ dayId: 'd1', km: 210, label: 'วัน 1' }, { dayId: 'd2', km: 0, label: 'วัน 2' }],
    defaults: { kmPerL: 14, pricePerL: 35 },
    manualItemIds: new Set<string>(),
    manualFuelDays: new Set<string>(),
  };

  it('uses trip fuel settings over defaults', () => {
    expect(fuelParams({ fuel_km_per_l: 10, fuel_price_per_l: 40, vehicle_count: 2 } as never, base.defaults)).toEqual({ kmPerL: 10, pricePerL: 40, vehicles: 2 });
    expect(fuelParams({ fuel_km_per_l: null, fuel_price_per_l: null, vehicle_count: 1 } as never, base.defaults)).toEqual({ kmPerL: 14, pricePerL: 35, vehicles: 1 });
  });

  it('creates fuel, entry fee, meal and lodging rows; skips unknown prices', () => {
    const rows = buildAutoRows({
      ...base,
      items: [
        item({ id: 'a', item_type: 'place', title: 'วัด', est_cost: 50 }),
        item({ id: 'b', item_type: 'meal', title: 'อาหารกลางวัน' }),
        item({ id: 'c', item_type: 'place', title: 'หาด' }), // no price -> skipped
        item({ id: 'd', day_id: null, item_type: 'place', title: 'x', est_cost: 100 }), // unscheduled -> skipped
        item({ id: 'e', day_id: 'd2', item_type: 'lodging', title: 'โรงแรม', est_cost: 1800 }),
      ],
    });
    expect(rows.map((r) => [r.slug, r.estimated])).toEqual([['fuel', 525], ['entry', 100], ['food', 300], ['lodging', 1800]]);
  });

  it('does not duplicate rows the user already entered manually', () => {
    const rows = buildAutoRows({
      ...base,
      manualItemIds: new Set(['b']),
      manualFuelDays: new Set(['d1']),
      items: [item({ id: 'b', item_type: 'meal', title: 'อาหาร' })],
    });
    expect(rows).toEqual([]);
  });

  it('no fuel for walking / public transport', () => {
    const rows = buildAutoRows({ ...base, trip: { ...(trip as object), mode: 'walk' } as never, items: [] });
    expect(rows).toEqual([]);
  });
});
