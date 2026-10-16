import { parseQuickLog, type QuickLogContext } from './quick-log.parser';

const ctx: QuickLogContext = {
  categories: [
    { id: 'c-food', name: 'Ăn uống', type: 'EXPENSE' },
    { id: 'c-move', name: 'Di chuyển', type: 'EXPENSE' },
    { id: 'c-salary', name: 'Lương', type: 'INCOME' },
  ],
  wallets: [
    { id: 'w-cash', name: 'Ví tiền mặt' },
    { id: 'w-tcb', name: 'Thẻ Techcombank' },
  ],
};

describe('parseQuickLog', () => {
  it('fills every field from the headline example', () => {
    expect(parseQuickLog('55k phở bò ví tiền mặt', ctx)).toEqual({
      amount: 55_000,
      type: 'EXPENSE',
      categoryId: 'c-food',
      accountId: 'w-cash',
      description: 'phở bò',
      unresolved: [],
    });
  });

  it('matches a wallet by its distinctive name and a category by alias', () => {
    expect(parseQuickLog('Grab 42k thẻ techcombank', ctx)).toMatchObject({
      amount: 42_000,
      categoryId: 'c-move',
      accountId: 'w-tcb',
      description: 'Grab',
    });
  });

  it('detects income and picks only income categories', () => {
    expect(parseQuickLog('lương tháng 10 15tr', ctx)).toMatchObject({
      amount: 15_000_000,
      type: 'INCOME',
      categoryId: 'c-salary',
    });
  });

  it('refuses to guess when two amounts are present', () => {
    const draft = parseQuickLog('50k ship 20k', ctx);
    expect(draft.amount).toBeNull();
    expect(draft.unresolved).toContain('amount');
  });

  it('flags an unknown category and keeps the description', () => {
    expect(parseQuickLog('120k đóng góp xyz', ctx)).toMatchObject({
      amount: 120_000,
      categoryId: null,
      accountId: null,
      description: 'đóng góp xyz',
      unresolved: ['category'],
    });
  });

  it('does not pick between two wallets that match equally', () => {
    const twin = {
      ...ctx,
      wallets: [
        { id: 'a', name: 'Ví Momo' },
        { id: 'b', name: 'Thẻ Momo' },
      ],
    };
    expect(parseQuickLog('30k momo', twin).accountId).toBeNull();
  });

  it('survives empty lists and nonsense', () => {
    const empty = { categories: [], wallets: [] };
    expect(parseQuickLog('???', empty)).toMatchObject({
      amount: null,
      categoryId: null,
      accountId: null,
      description: '???',
    });
  });

  it('prefers a learned keyword over the built-in alias', () => {
    const learned = { ...ctx, learned: { be: 'c-food' } };
    expect(parseQuickLog('45k be', learned).categoryId).toBe('c-food');
  });

  it('never auto-picks an investment category', () => {
    const inv = {
      ...ctx,
      categories: [
        { id: 'c-inv', name: 'Đầu tư', type: 'INVESTMENT' as const },
      ],
    };
    expect(parseQuickLog('1tr đầu tư', inv).categoryId).toBeNull();
  });

  it('does not leak a category whose name only matches inside a longer word', () => {
    expect(parseQuickLog('30k luongxyz', ctx).categoryId).toBeNull();
  });
});
