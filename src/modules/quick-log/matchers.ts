import { CATEGORY_ALIASES, INCOME_CUES, WALLET_CUES } from './category-aliases';
import type { QuickLogCategory, QuickLogWallet } from './quick-log.types';
import { fold } from './text';

export interface Span {
  start: number;
  end: number;
}

export interface WalletMatch {
  id: string;
  /** The wallet phrase plus an immediately preceding cue word. */
  span: Span;
}

export interface CategoryMatch {
  /** Null when nothing matched or several categories matched equally. */
  id: string | null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word search on folded text. Spaces in the phrase match any whitespace run. */
export function findPhrase(folded: string, phrase: string): Span | null {
  if (!phrase) return null;
  const pattern = escapeRegex(phrase).replace(/\s+/g, '\\s+');
  const m = new RegExp(`(?<![a-z0-9])${pattern}(?![a-z0-9])`).exec(folded);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

export function detectType(folded: string): 'EXPENSE' | 'INCOME' {
  if (folded.trimStart().startsWith('+')) return 'INCOME';
  return INCOME_CUES.some((cue) => findPhrase(folded, cue))
    ? 'INCOME'
    : 'EXPENSE';
}

const CUE_TOKENS = new Set(WALLET_CUES.flatMap((cue) => cue.split(' ')));

/** "Thẻ Techcombank" -> "techcombank"; a name made only of cue words keeps itself. */
function distinctiveName(name: string): string {
  const folded = fold(name).trim();
  const rest = folded
    .split(/\s+/)
    .filter((token) => !CUE_TOKENS.has(token))
    .join(' ');
  return rest || folded;
}

/** Longest distinctive name found in the text wins; equal-length rivals cancel out. */
export function matchWallet(
  folded: string,
  wallets: QuickLogWallet[],
): WalletMatch | null {
  const hits = wallets
    .map((wallet) => {
      const key = distinctiveName(wallet.name);
      return { wallet, key, span: findPhrase(folded, key) };
    })
    .filter((hit) => hit.span !== null);
  if (hits.length === 0) return null;

  const longest = Math.max(...hits.map((hit) => hit.key.length));
  const best = hits.filter((hit) => hit.key.length === longest);
  if (best.length !== 1) return null;

  const { wallet, span } = best[0];
  return { id: wallet.id, span: extendOverCue(folded, span) };
}

function extendOverCue(folded: string, span: Span): Span {
  const before = folded.slice(0, span.start);
  for (const cue of WALLET_CUES) {
    const m = new RegExp(
      `(?<![a-z0-9])${escapeRegex(cue).replace(/\s+/g, '\\s+')}\\s+$`,
    ).exec(before);
    if (m) return { start: m.index, end: span.end };
  }
  return span;
}

const TYPE_OF: Record<'EXPENSE' | 'INCOME', QuickLogCategory['type']> = {
  EXPENSE: 'EXPENSE',
  INCOME: 'INCOME',
};

/**
 * Priority: category name in the text, then the user's learned keywords, then
 * built-in aliases. A tier that names two different categories is ambiguous
 * and stops the search: guessing would hide the problem from the user.
 */
export function matchCategory(
  folded: string,
  categories: QuickLogCategory[],
  type: 'EXPENSE' | 'INCOME',
  learned: Record<string, string> = {},
): CategoryMatch {
  const eligible = categories.filter((c) => c.type === TYPE_OF[type]);
  const eligibleIds = new Set(eligible.map((c) => c.id));

  const tiers: Array<() => Set<string>> = [
    () =>
      new Set(
        eligible
          .filter((c) => findPhrase(folded, fold(c.name).trim()))
          .map((c) => c.id),
      ),
    () =>
      new Set(
        Object.entries(learned)
          .filter(([key, id]) => eligibleIds.has(id) && findPhrase(folded, key))
          .map(([, id]) => id),
      ),
    () =>
      new Set(
        Object.entries(CATEGORY_ALIASES)
          .filter(([, words]) => words.some((w) => findPhrase(folded, w)))
          .flatMap(([hint]) =>
            eligible
              .filter((c) => fold(c.name).includes(hint))
              .map((c) => c.id),
          ),
      ),
  ];

  for (const tier of tiers) {
    const ids = tier();
    if (ids.size === 1) return { id: [...ids][0] };
    if (ids.size > 1) return { id: null };
  }
  return { id: null };
}
