import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { from: mocks.from },
}));

import { updateBudgetItem, type BudgetItemInput } from './budgetApi';

const input: BudgetItemInput = {
  category_id: 'food',
  day_id: 'day-1',
  label: 'อาหารเย็น',
  estimated: 500.25,
  actual: 480.5,
  is_shared: true,
  paid_by: 'user-1',
  spent_at: '2026-11-21T01:05:00.000Z',
  notes: 'จ่ายด้วยบัตร',
};

const savedRow = {
  id: 'item-1',
  trip_id: 'trip-1',
  trip_item_id: null,
  is_auto: false,
  ...input,
};

describe('Part 8.1a API save verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
  });

  it('returns the row confirmed by PostgREST', async () => {
    mocks.single.mockResolvedValue({ data: savedRow, error: null });

    await expect(updateBudgetItem('item-1', input)).resolves.toMatchObject({
      id: 'item-1',
      actual: 480.5,
      spent_at: input.spent_at,
      is_auto: false,
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('rejects when UPDATE returns no row, including an RLS/no-match result', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } });

    await expect(updateBudgetItem('item-1', input)).rejects.toThrow('บันทึกไม่สำเร็จ');
  });

  it('rejects when the returned row does not match the requested amount', async () => {
    mocks.single.mockResolvedValue({ data: { ...savedRow, actual: 480.49 }, error: null });

    await expect(updateBudgetItem('item-1', input)).rejects.toThrow('ตรวจสอบผลบันทึกไม่สำเร็จ');
  });

  it('rejects when the returned row is still automatic', async () => {
    mocks.single.mockResolvedValue({ data: { ...savedRow, is_auto: true }, error: null });

    await expect(updateBudgetItem('item-1', input)).rejects.toThrow('ตรวจสอบผลบันทึกไม่สำเร็จ');
  });
});
