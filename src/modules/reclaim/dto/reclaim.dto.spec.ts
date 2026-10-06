import {
  reclaimHistoryQuerySchema,
  transferReclaimSchema,
} from './reclaim.dto';

describe('reclaim DTOs', () => {
  it('transfer needs a goal and a positive amount, rejects unknown keys', () => {
    expect(
      transferReclaimSchema.safeParse({ goalId: 'g', amount: 600000 }).success,
    ).toBe(true);
    expect(
      transferReclaimSchema.safeParse({ goalId: 'g', amount: 0 }).success,
    ).toBe(false);
    expect(transferReclaimSchema.safeParse({ amount: 1 }).success).toBe(false);
    expect(
      transferReclaimSchema.safeParse({
        goalId: 'g',
        amount: 1,
        computedAmount: 9,
      }).error?.issues[0].message,
    ).toBe('Trường không hợp lệ: computedAmount');
  });

  it('rejects amounts above Decimal(12,2) max, accepts the max itself', () => {
    expect(
      transferReclaimSchema.safeParse({ goalId: 'g', amount: 10_000_000_000 })
        .error?.issues[0].message,
    ).toBe('Số tiền vượt quá giới hạn cho phép');
    expect(
      transferReclaimSchema.safeParse({
        goalId: 'g',
        amount: 9_999_999_999.99,
      }).success,
    ).toBe(true);
  });

  it('history months default to 12 and are capped at 24', () => {
    expect(reclaimHistoryQuerySchema.parse({})).toEqual({ months: 12 });
    expect(reclaimHistoryQuerySchema.parse({ months: '3' })).toEqual({
      months: 3,
    });
    expect(reclaimHistoryQuerySchema.safeParse({ months: '25' }).success).toBe(
      false,
    );
  });
});
