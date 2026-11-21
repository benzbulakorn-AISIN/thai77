import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['update', 'delete', 'select', 'eq', 'is']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn();
  return { from: vi.fn(() => builder), builder };
});

vi.mock('../../lib/supabase', () => ({
  supabase: { from: mocks.from },
}));

import { BudgetConflictError, clearBudgetActual, deleteBudgetItem, type BudgetItem } from './budgetApi';

const original: BudgetItem = {
  id: 'item-1',
  trip_id: 'trip-1',
  trip_item_id: null,
  category_id: 'food',
  day_id: 'day-1',
  label: 'อาหารเย็น',
  estimated: 500.25,
  actual: 480.5,
  is_shared: true,
  paid_by: 'user-1',
  is_auto: false,
  spent_at: '2026-11-21T01:05:00.000Z',
  notes: 'จ่ายด้วยบัตร',
};
const cleared = { ...original, actual: null, paid_by: null, spent_at: null };

describe('Part 8.1b clear actual with database verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of ['update', 'delete', 'select', 'eq', 'is']) {
      mocks.builder[method].mockImplementation(() => mocks.builder);
    }
  });

  it('updates only actual-payment fields, matches the old snapshot, then re-reads', async () => {
    mocks.builder.maybeSingle
      .mockResolvedValueOnce({ data: cleared, error: null })
      .mockResolvedValueOnce({ data: cleared, error: null });

    await expect(clearBudgetActual(original)).resolves.toMatchObject(cleared);
    expect(mocks.builder.update).toHaveBeenCalledWith({ actual: null, spent_at: null, paid_by: null });
    expect(mocks.builder.eq).toHaveBeenCalledWith('id', original.id);
    expect(mocks.builder.eq).toHaveBeenCalledWith('actual', original.actual);
    expect(mocks.builder.eq).toHaveBeenCalledWith('estimated', original.estimated);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it('rejects a concurrent edit instead of overwriting it', async () => {
    mocks.builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(clearBudgetActual(original)).rejects.toBeInstanceOf(BudgetConflictError);
  });

  it('does not report success if the verification read still has an actual amount', async () => {
    mocks.builder.maybeSingle
      .mockResolvedValueOnce({ data: cleared, error: null })
      .mockResolvedValueOnce({ data: { ...original, actual: 490 }, error: null });
    await expect(clearBudgetActual(original)).rejects.toBeInstanceOf(BudgetConflictError);
  });
});

describe('Part 8.1b delete with database verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of ['update', 'delete', 'select', 'eq', 'is']) {
      mocks.builder[method].mockImplementation(() => mocks.builder);
    }
  });

  it('deletes only the unchanged snapshot and re-reads until the row is absent', async () => {
    mocks.builder.maybeSingle
      .mockResolvedValueOnce({ data: original, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(deleteBudgetItem(original)).resolves.toBeUndefined();
    expect(mocks.builder.delete).toHaveBeenCalledOnce();
    expect(mocks.builder.eq).toHaveBeenCalledWith('label', original.label);
    expect(mocks.builder.is).toHaveBeenCalledWith('trip_item_id', null);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it('rejects when another editor changed the row during the Undo window', async () => {
    mocks.builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(deleteBudgetItem(original)).rejects.toBeInstanceOf(BudgetConflictError);
  });

  it('does not report success when the verification read finds the row', async () => {
    mocks.builder.maybeSingle
      .mockResolvedValueOnce({ data: original, error: null })
      .mockResolvedValueOnce({ data: original, error: null });
    await expect(deleteBudgetItem(original)).rejects.toBeInstanceOf(BudgetConflictError);
  });
});
