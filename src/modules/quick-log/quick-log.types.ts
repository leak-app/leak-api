export interface QuickLogCategory {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'INVESTMENT';
}

export interface QuickLogWallet {
  id: string;
  name: string;
}

export interface QuickLogContext {
  /** Active categories only. */
  categories: QuickLogCategory[];
  /** Active wallets only. */
  wallets: QuickLogWallet[];
  /** Folded past description -> category id the user chose most often. */
  learned?: Record<string, string>;
}

export interface QuickLogDraft {
  amount: number | null;
  type: 'EXPENSE' | 'INCOME';
  categoryId: string | null;
  accountId: string | null;
  description: string;
  unresolved: Array<'amount' | 'category'>;
}
