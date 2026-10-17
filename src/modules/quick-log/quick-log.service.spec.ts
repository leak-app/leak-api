import type { CategoryService } from '@/modules/categories/categories.service';
import type { TransactionService } from '@/modules/transactions/transactions.service';
import type { WalletService } from '@/modules/wallets/wallets.service';
import type { GeminiParser, GeminiResult } from './gemini.parser';
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
      { id: 'c-move', name: 'Di chuyển', type: 'EXPENSE', userId: 'user-1' },
      { id: 'c-pay', name: 'Lương', type: 'INCOME', userId: 'user-1' },
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
  const gemini = { parse: jest.fn() };
  const service = new QuickLogService(
    categories as unknown as CategoryService,
    wallets as unknown as WalletService,
    transactions as unknown as TransactionService,
    gemini as unknown as GeminiParser,
  );

  const reply = (partial: Partial<GeminiResult>) =>
    gemini.parse.mockResolvedValueOnce({
      amount: null,
      type: 'EXPENSE',
      categoryId: null,
      ...partial,
    });

  beforeEach(() => {
    gemini.parse.mockReset();
    gemini.parse.mockResolvedValue(null);
  });

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
  describe('Gemini fallback', () => {
    it('does not call Gemini when layer 1 resolved everything', async () => {
      await service.parse('user-1', { text: '55k phở bò ví tiền mặt' });
      expect(gemini.parse).not.toHaveBeenCalled();
    });

    it('asks Gemini for the category when layer 1 could not name it', async () => {
      reply({ categoryId: 'c-move' });
      const draft = await service.parse('user-1', { text: '120k xe ôm' });

      expect(gemini.parse).toHaveBeenCalledTimes(1);
      expect(draft).toEqual({
        amount: 120_000,
        type: 'EXPENSE',
        categoryId: 'c-move',
        accountId: null,
        description: 'xe ôm',
        unresolved: [],
      });
    });

    it('fills the amount from Gemini only when layer 1 found none', async () => {
      reply({ amount: 25_000, categoryId: 'c-move' });
      const draft = await service.parse('user-1', {
        text: 'hai lăm nghìn xe ôm',
      });

      expect(draft).toMatchObject({
        amount: 25_000,
        categoryId: 'c-move',
        unresolved: [],
      });
    });

    it('keeps a layer 1 amount even if Gemini disagrees', async () => {
      reply({ amount: 99_000, categoryId: 'c-move' });
      const draft = await service.parse('user-1', { text: '30k xe ôm' });
      expect(draft.amount).toBe(30_000);
    });

    it('does not resolve the two-amount case from Gemini', async () => {
      reply({ amount: 70_000, categoryId: 'c-move' });
      const draft = await service.parse('user-1', { text: '50k ship 20k' });

      expect(draft.amount).toBeNull();
      expect(draft.unresolved).toEqual(['amount']);
    });

    it('does not ask for a category layer 1 already found, only for a missing amount', async () => {
      reply({ amount: 25_000, categoryId: 'c-move' });
      const draft = await service.parse('user-1', {
        text: 'hai lăm nghìn phở bò',
      });

      expect(draft.categoryId).toBe('c-food');
      expect(draft.amount).toBe(25_000);
    });

    it('ignores a category id that is not the user’s', async () => {
      reply({ categoryId: 'someone-elses' });
      const draft = await service.parse('user-1', { text: '120k xe ôm' });

      expect(draft.categoryId).toBeNull();
      expect(draft.unresolved).toEqual(['category']);
    });

    it('ignores INCOME when the returned category is not an income category', async () => {
      reply({ type: 'INCOME', categoryId: 'c-move' });
      const draft = await service.parse('user-1', { text: '120k xe ôm' });

      expect(draft.type).toBe('EXPENSE');
      expect(draft.categoryId).toBeNull();
    });

    it('accepts INCOME when the returned category is an income category', async () => {
      reply({ type: 'INCOME', categoryId: 'c-pay' });
      const draft = await service.parse('user-1', { text: '15tr tháng 10' });

      expect(draft).toMatchObject({
        amount: 15_000_000,
        type: 'INCOME',
        categoryId: 'c-pay',
        unresolved: [],
      });
    });

    it('rejects a category whose type does not match the draft type', async () => {
      reply({ type: 'EXPENSE', categoryId: 'c-pay' });
      const draft = await service.parse('user-1', { text: '120k xe ôm' });
      expect(draft.categoryId).toBeNull();
    });

    it('returns the layer 1 draft unchanged when Gemini returns null', async () => {
      const draft = await service.parse('user-1', { text: '120k xe ôm' });
      expect(draft).toEqual({
        amount: 120_000,
        type: 'EXPENSE',
        categoryId: null,
        accountId: null,
        description: 'xe ôm',
        unresolved: ['category'],
      });
    });

    it('returns the layer 1 draft when the Gemini parser throws', async () => {
      gemini.parse.mockRejectedValueOnce(new Error('boom'));
      const draft = await service.parse('user-1', { text: '120k xe ôm' });
      expect(draft.unresolved).toEqual(['category']);
    });

    it('sends Gemini only the user id, the phrase and category id/name', async () => {
      await service.parse('user-1', { text: '120k xe ôm ví tiền mặt' });

      expect(gemini.parse).toHaveBeenCalledWith(
        'user-1',
        '120k xe ôm ví tiền mặt',
        [
          { id: 'c-food', name: 'Ăn uống' },
          { id: 'c-move', name: 'Di chuyển' },
          { id: 'c-pay', name: 'Lương' },
        ],
      );
    });
  });
});
