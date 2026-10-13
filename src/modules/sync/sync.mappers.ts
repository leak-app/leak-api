import { Prisma } from '@/generated/prisma/client';
import {
  SCHEMA_VERSION,
  SYNC_CURRENCY,
  SYNC_TIME_ZONE,
  type SheetRow,
} from './sync.schema';

/** Vietnam has no daylight saving time, so a fixed +7 h offset is exact. */
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');

function ictParts(date: Date) {
  const shifted = new Date(date.getTime() + ICT_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

/** yyyy-MM-dd in Asia/Ho_Chi_Minh. Never use toISOString().split('T')[0] (that is a UTC date). */
export function formatIctDate(date: Date): string {
  const { year, month, day } = ictParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** yyyy-MM-dd HH:mm:ss in Asia/Ho_Chi_Minh. */
export function formatIctDateTime(date: Date): string {
  const { hour, minute, second } = ictParts(date);
  return `${formatIctDate(date)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/** Integer yyyyMM in ICT. A number on purpose: text like "2026-10" is turned into a date by Sheets. */
export function toYearMonth(date: Date): number {
  const { year, month } = ictParts(date);
  return year * 100 + month;
}

/**
 * Cells are written with valueInputOption USER_ENTERED, so Sheets would evaluate text that
 * starts with = + - @ (formula injection) or tab/CR. A leading apostrophe keeps it as text.
 */
export function toSheetText(value: string | null | undefined): string {
  if (!value) return '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export interface TransactionSource {
  id: string;
  createdAt: Date;
  type: string;
  amount: Prisma.Decimal;
  description: string | null;
  outcome: string;
  leakReason: string | null;
  reviewedAt: Date | null;
  category: { name: string };
  account: { name: string };
}

export interface AccountSource {
  id: string;
  name: string;
  type: string;
  initialBalance: Prisma.Decimal;
  currentBalance: Prisma.Decimal;
}

export interface BudgetSource {
  year: number;
  month: number;
  amount: Prisma.Decimal;
  category: { name: string };
}

export interface GoalSource {
  id: string;
  name: string;
  targetAmount: Prisma.Decimal;
  savedAmount: Prisma.Decimal;
  targetDate: Date | null;
}

export function mapTransactionRows(
  items: readonly TransactionSource[],
): SheetRow[] {
  return items.map((item) => [
    item.id,
    formatIctDate(item.createdAt),
    toYearMonth(item.createdAt),
    item.type,
    item.amount.toNumber(),
    toSheetText(item.category.name),
    toSheetText(item.account.name),
    toSheetText(item.description),
    item.outcome,
    item.leakReason ?? '',
    item.reviewedAt ? formatIctDateTime(item.reviewedAt) : '',
  ]);
}

export function mapAccountRows(items: readonly AccountSource[]): SheetRow[] {
  return items.map((item) => [
    item.id,
    toSheetText(item.name),
    item.type,
    item.initialBalance.toNumber(),
    item.currentBalance.toNumber(),
  ]);
}

export function mapBudgetRows(items: readonly BudgetSource[]): SheetRow[] {
  return items.map((item) => [
    item.year * 100 + item.month,
    toSheetText(item.category.name),
    item.amount.toNumber(),
  ]);
}

export function mapGoalRows(items: readonly GoalSource[]): SheetRow[] {
  return items.map((item) => [
    item.id,
    toSheetText(item.name),
    item.targetAmount.toNumber(),
    item.savedAmount.toNumber(),
    item.targetDate ? formatIctDate(item.targetDate) : '',
  ]);
}

/** `_meta` is written last and doubles as the commit marker of a run. */
export function buildMetaRows(input: {
  now: Date;
  transactions: readonly TransactionSource[];
}): SheetRow[] {
  const expenseTotal = input.transactions
    .filter((item) => item.type === 'EXPENSE')
    .reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));

  return [
    ['schema_version', SCHEMA_VERSION],
    ['last_synced_at', formatIctDateTime(input.now)],
    ['timezone', SYNC_TIME_ZONE],
    ['currency', SYNC_CURRENCY],
    ['tx_count', input.transactions.length],
    ['expense_total', expenseTotal.toNumber()],
  ];
}
