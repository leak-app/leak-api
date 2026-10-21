import {
  BuddyMode,
  CategoryType,
  TransactionType,
} from '@/generated/prisma/client';
import {
  averageOf,
  selectForComment,
  type SelectorInput,
} from './comment-selector';

const base: SelectorInput = {
  type: TransactionType.EXPENSE,
  categoryType: CategoryType.EXPENSE,
  amount: 55_000,
  hourIct: 14,
  enteredLive: true,
  budgetAmount: 0,
  monthSpent: 55_000,
  categoryAverage: null,
  commentsToday: 0,
  dailyCap: 3,
  mode: BuddyMode.SAVAGE,
};
const pick = (over: Partial<SelectorInput>) =>
  selectForComment({ ...base, ...over });

describe('selectForComment', () => {
  it('ignores an ordinary spend', () => expect(pick({})).toBeNull());
  it('ignores income', () =>
    expect(pick({ type: TransactionType.INCOME, hourIct: 23 })).toBeNull());
  it('ignores everything when muted', () =>
    expect(pick({ mode: BuddyMode.MUTE, hourIct: 23 })).toBeNull());
  it('stops at the daily cap', () =>
    expect(pick({ hourIct: 23, commentsToday: 3 })).toBeNull());

  describe('OVER_BUDGET', () => {
    const over = { budgetAmount: 1_000_000 };
    it('fires on the spend that crosses the limit', () =>
      expect(pick({ ...over, monthSpent: 1_020_000 })).toEqual([
        'OVER_BUDGET',
      ]));
    it('stays quiet for spends after the limit was already crossed', () =>
      expect(pick({ ...over, monthSpent: 1_200_000 })).toBeNull());
    it('is not over when exactly at the limit', () =>
      expect(pick({ ...over, monthSpent: 1_000_000 })).toBeNull());
    it('needs a budget', () =>
      expect(pick({ budgetAmount: 0, monthSpent: 9_999_999 })).toBeNull());
  });

  describe('LATE_NIGHT', () => {
    it.each([22, 23, 0, 4])('fires at %p:00 when entered live', (hourIct) =>
      expect(pick({ hourIct })).toEqual(['LATE_NIGHT']),
    );
    it.each([5, 12, 21])('does not fire at %p:00', (hourIct) =>
      expect(pick({ hourIct })).toBeNull(),
    );
    it('does not fire for a backdated entry typed at night', () =>
      expect(pick({ hourIct: 23, enteredLive: false })).toBeNull());
    it('does not fire for an investment at night', () =>
      expect(
        pick({ hourIct: 23, categoryType: CategoryType.INVESTMENT }),
      ).toEqual(['INVESTMENT']));
  });

  describe('OUTLIER', () => {
    it('fires at twice the category average', () =>
      expect(pick({ amount: 90_000, categoryAverage: 40_000 })).toEqual([
        'OUTLIER',
      ]));
    it('needs a known average', () =>
      expect(pick({ amount: 900_000, categoryAverage: null })).toBeNull());
    it('ignores small amounts even when they are a big multiple', () =>
      expect(pick({ amount: 30_000, categoryAverage: 10_000 })).toBeNull());
    it('does not fire below twice the average', () =>
      expect(pick({ amount: 70_000, categoryAverage: 40_000 })).toBeNull());
  });

  it('hints INVESTMENT for investment categories', () =>
    expect(pick({ categoryType: CategoryType.INVESTMENT })).toEqual([
      'INVESTMENT',
    ]));

  it('lists every reason that applies, in a stable order', () =>
    expect(
      pick({
        budgetAmount: 100_000,
        monthSpent: 150_000,
        amount: 90_000,
        categoryAverage: 20_000,
        hourIct: 23,
      }),
    ).toEqual(['OVER_BUDGET', 'LATE_NIGHT', 'OUTLIER']));
});

describe('averageOf', () => {
  it('is null with too little history', () =>
    expect(averageOf([10, 20, 30, 40])).toBeNull());
  it('averages five or more amounts', () =>
    expect(averageOf([10, 20, 30, 40, 50])).toBe(30));
});
