import type { CategoryService } from '@/modules/categories/categories.service';
import type { WalletService } from '@/modules/wallets/wallets.service';
import { QuickLogService } from './quick-log.service';

describe('QuickLogService', () => {
  const categories = {
    findAll: jest.fn().mockResolvedValue([
      {
        id: 'c-food',
        name: 'Ăn uống',
        type: 'EXPENSE',
        emoji: '🍜',
        userId: 'user-1',
      },
    ]),
  };
  const wallets = {
    findOptions: jest
      .fn()
      .mockResolvedValue([{ id: 'w-cash', name: 'Ví tiền mặt' }]),
  };
  const service = new QuickLogService(
    categories as unknown as CategoryService,
    wallets as unknown as WalletService,
  );

  it("loads only the calling user's lists and returns a draft", async () => {
    const draft = await service.parse('user-1', {
      text: '55k phở bò ví tiền mặt',
    });

    expect(categories.findAll).toHaveBeenCalledWith('user-1');
    expect(wallets.findOptions).toHaveBeenCalledWith('user-1');
    expect(draft).toMatchObject({
      amount: 55_000,
      categoryId: 'c-food',
      accountId: 'w-cash',
    });
  });

  it('hands the parser only id, name and type of each category', async () => {
    const draft = await service.parse('user-1', { text: '30k cafe' });
    expect(draft).not.toHaveProperty('emoji');
    expect(draft).not.toHaveProperty('userId');
  });
});
