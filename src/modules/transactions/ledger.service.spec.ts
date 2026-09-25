import { Prisma } from '@/generated/prisma/client';
import { LedgerService } from './ledger.service';

describe('LedgerService', () => {
  let tx: { account: { update: jest.Mock } };
  let ledger: LedgerService;

  beforeEach(() => {
    tx = { account: { update: jest.fn().mockResolvedValue({}) } };
    ledger = new LedgerService();
  });

  const asTx = () => tx as unknown as Prisma.TransactionClient;

  it('apply increments each wallet by its delta', async () => {
    await ledger.apply(asTx(), [
      { accountId: 'cash', delta: new Prisma.Decimal(50000) },
      { accountId: 'bank', delta: new Prisma.Decimal(-50000) },
    ]);

    expect(tx.account.update).toHaveBeenCalledTimes(2);
    expect(tx.account.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'cash' },
      data: { currentBalance: { increment: new Prisma.Decimal(50000) } },
    });
    expect(tx.account.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'bank' },
      data: { currentBalance: { increment: new Prisma.Decimal(-50000) } },
    });
  });

  it('apply with no changes writes nothing', async () => {
    await ledger.apply(asTx(), []);
    expect(tx.account.update).not.toHaveBeenCalled();
  });

  it('shiftInitialBalance moves initial and current balance together', async () => {
    await ledger.shiftInitialBalance(asTx(), 'cash', new Prisma.Decimal(20000));
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 'cash' },
      data: {
        initialBalance: { increment: new Prisma.Decimal(20000) },
        currentBalance: { increment: new Prisma.Decimal(20000) },
      },
    });
  });

  it('shiftInitialBalance with a zero delta writes nothing', async () => {
    await ledger.shiftInitialBalance(asTx(), 'cash', new Prisma.Decimal(0));
    expect(tx.account.update).not.toHaveBeenCalled();
  });
});
