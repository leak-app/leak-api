import {
  createTransactionSchema,
  updateTransactionSchema,
} from './transactions.dto';

describe('updateTransactionSchema', () => {
  it('accepts a partial body, including a day', () => {
    expect(
      updateTransactionSchema.safeParse({
        amount: 55000,
        occurredOn: '2026-10-10',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown field instead of silently dropping it', () => {
    const result = updateTransactionSchema.safeParse({
      walletId: 'w1',
      amount: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty body', () => {
    const result = updateTransactionSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'Không có thay đổi nào để lưu',
    );
  });

  it.each([
    { amount: 0 },
    { amount: -5 },
    { amount: 10_000_000_000 },
    { categoryId: '' },
    { accountId: '' },
    { occurredOn: '10/10/2026' },
  ])('rejects %j', (body) => {
    expect(updateTransactionSchema.safeParse(body).success).toBe(false);
  });

  it('accepts the largest amount the column holds', () => {
    expect(
      updateTransactionSchema.safeParse({ amount: 9_999_999_999 }).success,
    ).toBe(true);
  });
});

describe('createTransactionSchema', () => {
  const base = { type: 'EXPENSE', categoryId: 'c1' } as const;

  it('refuses an amount the column cannot hold instead of failing in the database', () => {
    expect(
      createTransactionSchema.safeParse({ ...base, amount: 10_000_000_000 })
        .success,
    ).toBe(false);
  });

  it('accepts the largest amount the column holds', () => {
    expect(
      createTransactionSchema.safeParse({ ...base, amount: 9_999_999_999 })
        .success,
    ).toBe(true);
  });
});
