import { findAmounts } from './amount.parser';
import { detectType, matchCategory, matchWallet, type Span } from './matchers';
import type { QuickLogContext, QuickLogDraft } from './quick-log.types';
import { fold } from './text';

export type {
  QuickLogCategory,
  QuickLogContext,
  QuickLogDraft,
  QuickLogWallet,
} from './quick-log.types';

/**
 * Turns a typed phrase into a draft for the Add Transaction form. Pure: no I/O.
 * Anything it cannot resolve with certainty stays null instead of being guessed.
 */
export function parseQuickLog(
  text: string,
  ctx: QuickLogContext,
): QuickLogDraft {
  const original = text.normalize('NFC');
  const folded = fold(original);

  const amounts = findAmounts(folded);
  const amount = amounts.length === 1 ? amounts[0] : null;
  const type = detectType(folded);
  const wallet = matchWallet(folded, ctx.wallets);

  // Blank out the parts already explained so they cannot match a category.
  const spans: Span[] = [amount, wallet?.span].filter(
    (s): s is Span => s != null,
  );
  const category = matchCategory(
    maskSpans(folded, spans),
    ctx.categories,
    type,
    ctx.learned,
  );

  const unresolved: QuickLogDraft['unresolved'] = [];
  if (!amount) unresolved.push('amount');
  if (!category.id) unresolved.push('category');

  return {
    amount: amount?.value ?? null,
    type,
    categoryId: category.id,
    accountId: wallet?.id ?? null,
    description: describe(original, spans),
    unresolved,
  };
}

function maskSpans(text: string, spans: Span[]): string {
  return spans.reduce(
    (acc, { start, end }) =>
      acc.slice(0, start) + ' '.repeat(end - start) + acc.slice(end),
    text,
  );
}

function describe(original: string, spans: Span[]): string {
  const cleaned = [...spans]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (acc, { start, end }) => acc.slice(0, start) + ' ' + acc.slice(end),
      original,
    )
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || original.trim();
}
