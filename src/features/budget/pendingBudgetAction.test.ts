import { describe, expect, it } from 'vitest';
import type { BudgetItem } from './budgetApi';
import {
  applyPendingBudgetAction,
  BUDGET_UNDO_MS,
  createPendingBudgetAction,
  databaseHasActionResult,
  restorePendingBudgetAction,
} from './pendingBudgetAction';

const item = (v: Partial<BudgetItem> = {}): BudgetItem => ({
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
  ...v,
});

describe('Part 8.1b short Undo window', () => {
  it('uses a six-second window before any database mutation', () => {
    const action = createPendingBudgetAction('clear-actual', item(), [item()], 1_000);
    expect(BUDGET_UNDO_MS).toBe(6_000);
    expect(action.deadline).toBe(7_000);
  });

  it('clears only actual-payment fields while keeping the estimate and row', () => {
    const original = item();
    const action = createPendingBudgetAction('clear-actual', original, [original], 1_000);
    const [cleared] = applyPendingBudgetAction([original], action);

    expect(cleared).toMatchObject({
      id: original.id,
      estimated: 500.25,
      actual: null,
      paid_by: null,
      spent_at: null,
      notes: original.notes,
    });
  });

  it('restores the exact snapshot when clear is undone before commit', () => {
    const original = item();
    const action = createPendingBudgetAction('clear-actual', original, [original], 1_000);
    const restored = restorePendingBudgetAction(applyPendingBudgetAction([original], action), action);
    expect(restored).toEqual([original]);
  });

  it('hides a pending delete and restores it at the original list position', () => {
    const before = item({ id: 'before' });
    const target = item({ id: 'target' });
    const after = item({ id: 'after' });
    const lines = [before, target, after];
    const action = createPendingBudgetAction('delete-item', target, lines, 1_000);

    expect(applyPendingBudgetAction(lines, action).map((line) => line.id)).toEqual(['before', 'after']);
    expect(restorePendingBudgetAction([before, after], action).map((line) => line.id)).toEqual(['before', 'target', 'after']);
  });
});

describe('Part 8.1b database-result verification', () => {
  it('accepts clear only when amount, paid-by and paid-at are all null', () => {
    const original = item();
    const action = createPendingBudgetAction('clear-actual', original, [original], 1_000);
    expect(databaseHasActionResult([item({ actual: null, paid_by: null, spent_at: null })], action)).toBe(true);
    expect(databaseHasActionResult([item({ actual: null, paid_by: 'user-1', spent_at: null })], action)).toBe(false);
  });

  it('accepts delete only when the row is absent', () => {
    const original = item();
    const action = createPendingBudgetAction('delete-item', original, [original], 1_000);
    expect(databaseHasActionResult([], action)).toBe(true);
    expect(databaseHasActionResult([original], action)).toBe(false);
  });
});
