import {
  BuddyMode,
  CategoryType,
  TransactionType,
} from '@/generated/prisma/client';

export type CommentReason =
  | 'OVER_BUDGET'
  | 'LATE_NIGHT'
  | 'OUTLIER'
  | 'INVESTMENT';

export const DEFAULT_DAILY_CAP = 3;
export const MIN_HISTORY = 5;
const OUTLIER_FACTOR = 2;
const MIN_OUTLIER_AMOUNT = 50_000;
const LATE_NIGHT_FROM_HOUR = 22;
const LATE_NIGHT_BEFORE_HOUR = 5;

export interface SelectorInput {
  type: TransactionType;
  categoryType: CategoryType;
  amount: number;
  /** Hour of day in Vietnam when the transaction happened. */
  hourIct: number;
  /** True when it was typed in right when it happened, not backdated. */
  enteredLive: boolean;
  /** This category's budget for the month; 0 when there is none. */
  budgetAmount: number;
  /** Month-to-date spend in this category up to and including this spend. */
  monthSpent: number;
  /** Average of the user's earlier spends in this category; null with too little history. */
  categoryAverage: number | null;
  commentsToday: number;
  dailyCap: number;
  mode: BuddyMode;
}

/**
 * Why this spend deserves a comment, or null when it does not. Runs before any model call,
 * so a spend that is not picked costs nothing.
 */
export function selectForComment(input: SelectorInput): CommentReason[] | null {
  if (input.mode === BuddyMode.MUTE) return null;
  if (input.type !== TransactionType.EXPENSE) return null;
  if (input.commentsToday >= input.dailyCap) return null;

  const reasons: CommentReason[] = [];

  // Only the spend that crosses the limit, so later spends do not repeat the same scolding.
  if (
    input.budgetAmount > 0 &&
    input.monthSpent > input.budgetAmount &&
    input.monthSpent - input.amount <= input.budgetAmount
  ) {
    reasons.push('OVER_BUDGET');
  }

  const lateNight =
    input.hourIct >= LATE_NIGHT_FROM_HOUR ||
    input.hourIct < LATE_NIGHT_BEFORE_HOUR;
  if (
    input.enteredLive &&
    lateNight &&
    input.categoryType === CategoryType.EXPENSE
  ) {
    reasons.push('LATE_NIGHT');
  }

  if (
    input.categoryAverage !== null &&
    input.amount >= MIN_OUTLIER_AMOUNT &&
    input.amount >= input.categoryAverage * OUTLIER_FACTOR
  ) {
    reasons.push('OUTLIER');
  }

  if (input.categoryType === CategoryType.INVESTMENT)
    reasons.push('INVESTMENT');

  return reasons.length > 0 ? reasons : null;
}

/** The mean of the amounts, or null when there are fewer than MIN_HISTORY of them. */
export function averageOf(amounts: number[]): number | null {
  if (amounts.length < MIN_HISTORY) return null;
  return amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
}
