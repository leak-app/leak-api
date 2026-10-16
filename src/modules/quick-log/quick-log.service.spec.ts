import type { CategoryService } from '@/modules/categories/categories.service';
import type { TransactionService } from '@/modules/transactions/transactions.service';
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
  const transactions = {
    findRecentDescriptions: jest.fn().mockResolvedValue([]),
  };
  const service = new QuickLogService(
    categories as unknown as CategoryService,
    wallets as unknown as WalletService,
    transactions as unknown as TransactionService,
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

  it("learns from the calling user's own history", async () => {
    transactions.findRecentDescriptions.mockResolvedValueOnce([
      { description: 'bữa trưa công ty', categoryId: 'c-food' },
      { description: 'bữa trưa công ty', categoryId: 'c-food' },
    ]);

    const draft = await service.parse('user-1', {
      text: '70k bữa trưa công ty',
    });

    expect(transactions.findRecentDescriptions).toHaveBeenCalledWith('user-1');
    expect(draft.categoryId).toBe('c-food');
  });

  it('works for a user with no history', async () => {
    transactions.findRecentDescriptions.mockResolvedValueOnce([]);
    const draft = await service.parse('user-1', { text: '70k xyz' });
    expect(draft.categoryId).toBeNull();
  });
});
