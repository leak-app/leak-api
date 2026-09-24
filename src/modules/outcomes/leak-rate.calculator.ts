import { LeakReason, SpendOutcome } from '@/generated/prisma/client';

/** A category needs this many reviewed expenses before its rate is meaningful. */
export const MIN_REVIEWED_FOR_RATE = 5;

const LEAK_REASON_ORDER = Object.values(LeakReason);

export interface OutcomeGroup {
  categoryId: string;
  outcome: SpendOutcome;
  amount: number;
  count: number;
}

export interface ReasonGroup {
  categoryId: string;
  leakReason: LeakReason;
  amount: number;
}

export interface CategoryInfo {
  id: string;
  name: string;
  emoji: string | null;
}

export interface LeakRateRow {
  categoryId: string | null;
  name: string | null;
  emoji: string | null;
  totalSpent: number;
  leakAmount: number;
  worthItAmount: number;
  neutralAmount: number;
  unreviewedAmount: number;
  reviewedCount: number;
  leakRate: number | null;
  topLeakReason: LeakReason | null;
}

export interface LeakRateReport {
  month: number;
  year: number;
  categories: LeakRateRow[];
  summary: LeakRateRow;
}

function emptyRow(info: {
  categoryId: string | null;
  name: string | null;
  emoji: string | null;
}): LeakRateRow {
  return {
    ...info,
    totalSpent: 0,
    leakAmount: 0,
    worthItAmount: 0,
    neutralAmount: 0,
    unreviewedAmount: 0,
    reviewedCount: 0,
    leakRate: null,
    topLeakReason: null,
  };
}

function addGroup(row: LeakRateRow, g: OutcomeGroup) {
  row.totalSpent += g.amount;
  switch (g.outcome) {
    case SpendOutcome.LEAK:
      row.leakAmount += g.amount;
      break;
    case SpendOutcome.WORTH_IT:
      row.worthItAmount += g.amount;
      break;
    case SpendOutcome.NEUTRAL:
      row.neutralAmount += g.amount;
      break;
    case SpendOutcome.UNREVIEWED:
      row.unreviewedAmount += g.amount;
      break;
  }
  if (g.outcome !== SpendOutcome.UNREVIEWED) {
    row.reviewedCount += g.count;
  }
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;

function finalize(row: LeakRateRow, reasons?: Map<LeakReason, number>) {
  row.totalSpent = roundMoney(row.totalSpent);
  row.leakAmount = roundMoney(row.leakAmount);
  row.worthItAmount = roundMoney(row.worthItAmount);
  row.neutralAmount = roundMoney(row.neutralAmount);
  row.unreviewedAmount = roundMoney(row.unreviewedAmount);

  const reviewedSpent = row.totalSpent - row.unreviewedAmount;
  row.leakRate =
    row.reviewedCount >= MIN_REVIEWED_FOR_RATE && reviewedSpent > 0
      ? Math.round((row.leakAmount / reviewedSpent) * 10000) / 10000
      : null;

  let best = 0;
  for (const reason of LEAK_REASON_ORDER) {
    const amount = reasons?.get(reason) ?? 0;
    if (amount > best) {
      best = amount;
      row.topLeakReason = reason;
    }
  }
}

function addReason(
  map: Map<string, Map<LeakReason, number>>,
  key: string,
  r: ReasonGroup,
) {
  const reasons = map.get(key) ?? new Map<LeakReason, number>();
  reasons.set(r.leakReason, (reasons.get(r.leakReason) ?? 0) + r.amount);
  map.set(key, reasons);
}

export function buildLeakRateReport(
  month: number,
  year: number,
  outcomeGroups: OutcomeGroup[],
  reasonGroups: ReasonGroup[],
  categories: CategoryInfo[],
): LeakRateReport {
  const info = new Map(categories.map((c) => [c.id, c]));
  const rows = new Map<string, LeakRateRow>();
  const summary = emptyRow({ categoryId: null, name: null, emoji: null });

  for (const g of outcomeGroups) {
    let row = rows.get(g.categoryId);
    if (!row) {
      const c = info.get(g.categoryId);
      row = emptyRow({
        categoryId: g.categoryId,
        name: c?.name ?? null,
        emoji: c?.emoji ?? null,
      });
      rows.set(g.categoryId, row);
    }
    addGroup(row, g);
    addGroup(summary, g);
  }

  const SUMMARY_KEY = '__summary__';
  const reasons = new Map<string, Map<LeakReason, number>>();
  for (const r of reasonGroups) {
    addReason(reasons, r.categoryId, r);
    addReason(reasons, SUMMARY_KEY, r);
  }

  for (const [categoryId, row] of rows) {
    finalize(row, reasons.get(categoryId));
  }
  finalize(summary, reasons.get(SUMMARY_KEY));

  const sorted = [...rows.values()].sort(
    (a, b) => b.leakAmount - a.leakAmount || b.totalSpent - a.totalSpent,
  );

  return { month, year, categories: sorted, summary };
}
