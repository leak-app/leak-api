import { BadRequestException } from '@nestjs/common';
import { WalletResolver } from './wallet-resolver.service';

describe('WalletResolver', () => {
  const resolver = new WalletResolver();
  const tx = () => ({
    account: { findFirst: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'w' }]),
  });

  it('uses the explicit wallet when given', async () => {
    const t = tx();
    t.account.findFirst.mockResolvedValue({ id: 'w' });
    await expect(resolver.resolve(t as never, 'u', 'w')).resolves.toBe('w');
    expect(t.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'w', userId: 'u', isDeleted: false },
      select: { id: true },
    });
  });

  it('falls back to the default wallet when no id is given', async () => {
    const t = tx();
    t.account.findFirst.mockResolvedValueOnce({ id: 'cash' });
    await expect(resolver.resolve(t as never, 'u')).resolves.toBe('cash');
  });

  it('rejects a wallet that is foreign or archived', async () => {
    const t = tx();
    t.account.findFirst.mockResolvedValue(null);
    await expect(resolver.resolve(t as never, 'u', 'x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
