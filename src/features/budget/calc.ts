// Pure budget calculations (no React / Supabase) — easy to test.

export type BudgetStatus = 'ok' | 'near' | 'over' | 'none';

export type BudgetLine = {
  id: string;
  category_id: string;
  day_id: string | null;
  label: string;
  estimated: number;
  actual: number | null;
  is_shared: boolean;
  paid_by: string | null;
  is_auto: boolean;
};

export type FuelInput = { km: number; kmPerL: number; pricePerL: number; vehicles: number };

/** litres and cost, both rounded; 0 when inputs are invalid */
export function fuelCost({ km, kmPerL, pricePerL, vehicles }: FuelInput) {
  if (!(km > 0) || !(kmPerL > 0) || !(pricePerL >= 0) || !(vehicles > 0)) return { litres: 0, cost: 0 };
  const litres = (km / kmPerL) * vehicles;
  return { litres: Math.round(litres * 10) / 10, cost: Math.round(litres * pricePerL) };
}

/** budget limit from total or per-person (total wins when both set) */
export function budgetLimit(total: number | null, perPerson: number | null, travelers: number): number | null {
  if (total != null && total > 0) return total;
  if (perPerson != null && perPerson > 0) return perPerson * Math.max(1, travelers);
  return null;
}

/** green < 80%, yellow 80–100%, red > 100% */
export function statusOf(value: number, limit: number | null): BudgetStatus {
  if (limit == null || limit <= 0) return 'none';
  const r = value / limit;
  if (r > 1) return 'over';
  if (r >= 0.8) return 'near';
  return 'ok';
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** actual when recorded, otherwise the estimate (used for "expected spend") */
export const effective = (l: BudgetLine) => (l.actual != null ? l.actual : l.estimated);

export type Summary = {
  estimated: number;
  reserve: number;
  plannedWithReserve: number;
  actual: number;
  expected: number;
  limit: number | null;
  remaining: number | null;
  planStatus: BudgetStatus;
  spendStatus: BudgetStatus;
  perPersonShared: number;
  personal: number;
};

export function summarize(lines: BudgetLine[], o: { reservePct: number; limit: number | null; travelers: number }): Summary {
  const estimated = sum(lines.map((l) => l.estimated));
  const reserve = Math.round((estimated * Math.max(0, o.reservePct)) / 100);
  const actual = sum(lines.map((l) => l.actual ?? 0));
  const expected = sum(lines.map(effective));
  const shared = sum(lines.filter((l) => l.is_shared).map(effective));
  const personal = sum(lines.filter((l) => !l.is_shared).map(effective));
  return {
    estimated,
    reserve,
    plannedWithReserve: estimated + reserve,
    actual,
    expected,
    limit: o.limit,
    remaining: o.limit == null ? null : o.limit - actual,
    planStatus: statusOf(estimated + reserve, o.limit),
    spendStatus: statusOf(actual, o.limit),
    perPersonShared: Math.round(shared / Math.max(1, o.travelers)),
    personal,
  };
}

export type Group = { key: string; estimated: number; actual: number; count: number };

export function groupBy(lines: BudgetLine[], key: (l: BudgetLine) => string): Group[] {
  const m = new Map<string, Group>();
  for (const l of lines) {
    const k = key(l);
    const g = m.get(k) ?? { key: k, estimated: 0, actual: 0, count: 0 };
    g.estimated += l.estimated;
    g.actual += l.actual ?? 0;
    g.count++;
    m.set(k, g);
  }
  return [...m.values()];
}

/** who paid how much (shared items with actual), and each member's fair share */
export function settlement(lines: BudgetLine[], memberIds: string[]) {
  const paid = new Map<string, number>(memberIds.map((id) => [id, 0]));
  let total = 0;
  for (const l of lines) {
    if (!l.is_shared || l.actual == null || !l.paid_by) continue;
    total += l.actual;
    paid.set(l.paid_by, (paid.get(l.paid_by) ?? 0) + l.actual);
  }
  const n = Math.max(1, paid.size);
  const share = total / n;
  return [...paid.entries()].map(([id, p]) => ({ id, paid: p, share: Math.round(share), balance: Math.round(p - share) }));
}

export const baht = (n: number) => `฿${Math.round(n).toLocaleString('th-TH')}`;
