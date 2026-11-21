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

/** Display baht with two decimal places, including satang. */
export const baht = (n: number): string =>
  `฿${n.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Empty input returns null.
 * Invalid input returns NaN.
 * Accepts non-negative amounts below 10 million, up to two decimals.
 */
export function parseMoneyInput(input: string): number | null {
  const text = input.trim();

  if (text === '') return null;

  const value = text.replace(/^฿\s*/, '');

  const valid =
    /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)
    || /^\.\d{1,2}$/.test(value);

  if (!valid) return Number.NaN;

  const amount = Number(value.replace(/,/g, ''));

  if (!Number.isFinite(amount) || amount < 0 || amount >= 10_000_000) {
    return Number.NaN;
  }

  return amount;
}

/** Convert an ISO timestamp to the browser's local datetime-local value. */
export function toDateTimeLocal(
  value: string | null | undefined,
): string {
  if (!value) return '';

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return '';

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    `${String(date.getFullYear()).padStart(4, '0')}`
    + `-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Convert a valid browser-local minute value to an ISO timestamp. */
export function localDateTimeToIso(value: string): string | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (
    year < 1
    || month < 1 || month > 12
    || day < 1 || day > 31
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
  ) {
    return null;
  }

  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, 0, 0);

  // Reject invalid dates and local times that normalize to another value.
  if (
    !Number.isFinite(date.getTime())
    || toDateTimeLocal(date.toISOString()) !== value
  ) {
    return null;
  }

  return date.toISOString();
}
