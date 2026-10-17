import { fold } from './text';

export interface DescribedTransaction {
  description: string | null;
  categoryId: string;
}

/**
 * Maps each folded past description to the category the user chose for it most
 * often. A tie is dropped: with no clear winner the user should pick.
 */
export function learnKeywords(
  history: DescribedTransaction[],
): Record<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const { description, categoryId } of history) {
    const key = fold(description ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (key.length < 2) continue;
    const perCategory = counts.get(key) ?? new Map<string, number>();
    perCategory.set(categoryId, (perCategory.get(categoryId) ?? 0) + 1);
    counts.set(key, perCategory);
  }

  const learned: Record<string, string> = {};
  for (const [key, perCategory] of counts) {
    const ranked = [...perCategory].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) {
      learned[key] = ranked[0][0];
    }
  }
  return learned;
}
