import { AccountType } from '@/generated/prisma/client';
import { createWalletSchema, updateWalletSchema } from './wallets.dto';

describe('wallet DTO schemas', () => {
  it('rejects currentBalance on update instead of silently dropping it', () => {
    const result = updateWalletSchema.safeParse({ currentBalance: 5000 });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'Trường không hợp lệ: currentBalance',
    ]);
  });

  it('rejects unknown fields on create', () => {
    const result = createWalletSchema.safeParse({
      name: 'Ví',
      type: AccountType.LIQUID,
      currentBalance: 1,
      color: 'red',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'Trường không hợp lệ: currentBalance, color',
    ]);
  });

  it('still accepts valid payloads', () => {
    expect(updateWalletSchema.safeParse({ name: 'Ví chính' }).success).toBe(
      true,
    );
    expect(
      createWalletSchema.safeParse({ name: 'Ví', type: AccountType.LIQUID })
        .data,
    ).toEqual({ name: 'Ví', type: AccountType.LIQUID, initialBalance: 0 });
  });
});
