import type { BudgetItem } from './budgetApi';

export const BUDGET_UNDO_MS = 6_000;

export type PendingBudgetAction = {
  token: string;
  kind: 'clear-actual' | 'delete-item';
  item: BudgetItem;
  originalIndex: number;
  deadline: number;
};

export function createPendingBudgetAction(
  kind: PendingBudgetAction['kind'],
  item: BudgetItem,
  lines: BudgetItem[],
  now = Date.now(),
): PendingBudgetAction {
  return {
    token: `${now}-${item.id}-${kind}`,
    kind,
    item: { ...item },
    originalIndex: Math.max(0, lines.findIndex((line) => line.id === item.id)),
    deadline: now + BUDGET_UNDO_MS,
  };
}

/** Show the result immediately while the database mutation is deliberately delayed. */
export function applyPendingBudgetAction(lines: BudgetItem[], action: PendingBudgetAction): BudgetItem[] {
  if (action.kind === 'delete-item') return lines.filter((line) => line.id !== action.item.id);
  return lines.map((line) => line.id === action.item.id
    ? { ...line, actual: null, paid_by: null, spent_at: null }
    : line);
}

/** Undo is local because no database mutation is sent until the short window ends. */
export function restorePendingBudgetAction(lines: BudgetItem[], action: PendingBudgetAction): BudgetItem[] {
  const withoutSnapshot = lines.filter((line) => line.id !== action.item.id);
  const at = Math.min(action.originalIndex, withoutSnapshot.length);
  return [...withoutSnapshot.slice(0, at), { ...action.item }, ...withoutSnapshot.slice(at)];
}

export function databaseHasActionResult(lines: BudgetItem[], action: PendingBudgetAction): boolean {
  const current = lines.find((line) => line.id === action.item.id);
  if (action.kind === 'delete-item') return current == null;
  return current != null && current.actual == null && current.spent_at == null && current.paid_by == null;
}