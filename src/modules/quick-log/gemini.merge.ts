import type { GeminiResult } from './gemini.parser';
import type { QuickLogCategory, QuickLogDraft } from './quick-log.types';

/**
 * Layers what Gemini returned onto the layer 1 draft. Layer 1 always wins:
 * Gemini only fills what layer 1 left empty, and never adds an id of its own.
 */
export function mergeGemini(
  draft: QuickLogDraft,
  gemini: GeminiResult,
  categories: QuickLogCategory[],
  layer1AmountCount: number,
): QuickLogDraft {
  let { amount, type, categoryId } = draft;

  // Only when layer 1 saw no amount at all; never to settle several amounts.
  if (layer1AmountCount === 0 && amount === null) amount = gemini.amount;

  if (categoryId === null && gemini.categoryId !== null) {
    const picked = categories.find((c) => c.id === gemini.categoryId);
    // INCOME needs an INCOME category to back it up. A contradictory answer
    // (income with an expense category) is dropped whole.
    const consistent =
      picked && (gemini.type === 'EXPENSE' || picked.type === 'INCOME');
    const nextType = gemini.type === 'INCOME' ? 'INCOME' : type;
    if (consistent && picked.type === nextType) {
      categoryId = picked.id;
      type = nextType;
    }
  }

  const unresolved: QuickLogDraft['unresolved'] = [];
  if (amount === null) unresolved.push('amount');
  if (categoryId === null) unresolved.push('category');

  return { ...draft, amount, type, categoryId, unresolved };
}
