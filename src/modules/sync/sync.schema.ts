export const TAB_NAMES = {
  transactions: '_transactions',
  accounts: '_accounts',
  budgets: '_budgets',
  goals: '_goals',
  meta: '_meta',
} as const;

export type TabKey = keyof typeof TAB_NAMES;

export const TAB_KEYS: readonly TabKey[] = [
  'transactions',
  'accounts',
  'budgets',
  'goals',
  'meta',
];

/** Header rows, row 1 of every tab. Contract: wiki/sheet-template/README.md section 3. */
export const TAB_HEADERS: Record<TabKey, readonly string[]> = {
  transactions: [
    'id',
    'date',
    'year_month',
    'type',
    'amount',
    'category',
    'account',
    'description',
    'outcome',
    'leak_reason',
    'reviewed_at',
  ],
  accounts: ['id', 'name', 'type', 'initial_balance', 'current_balance'],
  budgets: ['year_month', 'category', 'amount'],
  goals: ['id', 'name', 'target_amount', 'saved_amount', 'target_date'],
  meta: ['key', 'value'],
};

export type SheetCell = string | number;
export type SheetRow = SheetCell[];
export type SnapshotTabs = Record<TabKey, SheetRow[]>;

export const SYNC_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const SYNC_CURRENCY = 'VND';
export const SCHEMA_VERSION = 1;
