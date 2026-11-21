import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import {
  autoRowsMatchExpected,
  BudgetAutoReplaceError,
  prepareAutoRows,
  replaceAutoRows,
  type BudgetCategory,
  type BudgetItem,
} from './budgetApi';

const categories: BudgetCategory[] = [
  { id: 'cat-food', slug: 'food', name_th: 'อาหาร', icon: 'utensils', color: '#f00', sort_order: 1 },
  { id: 'cat-fuel', slug: 'fuel', name_th: 'น้ำมัน', icon: 'fuel', color: '#fa0', sort_order: 2 },
];

const calculated = [
  { slug: 'food', day_id: 'day-1', trip_item_id: 'activity-1', label: 'อาหารกลางวัน', estimated: 250.5 },
  { slug: 'fuel', day_id: 'day-1', trip_item_id: null, label: 'น้ำมัน', estimated: 125.25 },
];

const inserted: BudgetItem[] = [
  {
    id: 'new-1', trip_id: 'trip-1', category_id: 'cat-food', day_id: 'day-1', trip_item_id: 'activity-1',
    label: 'อาหารกลางวัน', estimated: 250.5, actual: null, is_shared: true, paid_by: null, is_auto: true,
    spent_at: null, notes: null,
  },
  {
    id: 'new-2', trip_id: 'trip-1', category_id: 'cat-fuel', day_id: 'day-1', trip_item_id: null,
    label: 'น้ำมัน', estimated: 125.25, actual: null, is_shared: true, paid_by: null, is_auto: true,
    spent_at: null, notes: null,
  },
];

describe('Part 8.1c atomic automatic-budget replacement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses one RPC and never sends separate DELETE/INSERT requests', async () => {
    mocks.rpc.mockResolvedValue({ data: inserted, error: null });

    const expected = await replaceAutoRows('trip-1', calculated, categories);

    expect(expected).toEqual(prepareAutoRows(calculated, categories));
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('replace_budget_auto_items', {
      p_trip_id: 'trip-1',
      p_rows: expected,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('sends an empty array through the RPC so clearing auto rows is still atomic', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(replaceAutoRows('trip-1', [], categories)).resolves.toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith('replace_budget_auto_items', {
      p_trip_id: 'trip-1', p_rows: [],
    });
  });

  it('rejects a missing category before making a database request', async () => {
    await expect(replaceAutoRows('trip-1', [
      { ...calculated[0], slug: 'missing' },
    ], categories)).rejects.toThrow('ไม่พบหมวดงบ');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('keeps the intended complete set on RPC error for read-only verification', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'network response lost' } });
    const error = await replaceAutoRows('trip-1', calculated, categories).catch((x: unknown) => x);
    expect(error).toBeInstanceOf(BudgetAutoReplaceError);
    expect((error as BudgetAutoReplaceError).expected).toEqual(prepareAutoRows(calculated, categories));
  });

  it('rejects a partial or mismatched RPC response', async () => {
    mocks.rpc.mockResolvedValue({ data: inserted.slice(0, 1), error: null });
    await expect(replaceAutoRows('trip-1', calculated, categories)).rejects.toBeInstanceOf(BudgetAutoReplaceError);
  });

  it('compares the auto-row multiset independent of ids and order', () => {
    const expected = prepareAutoRows(calculated, categories);
    expect(autoRowsMatchExpected([...inserted].reverse(), expected)).toBe(true);
    expect(autoRowsMatchExpected([{ ...inserted[0], estimated: 250.49 }, inserted[1]], expected)).toBe(false);
    expect(autoRowsMatchExpected([{ ...inserted[0], is_auto: false }, inserted[1]], expected)).toBe(false);
  });
});
