/**
 * Lowercases and strips diacritics code point by code point. Every NFC
 * Vietnamese letter folds to exactly one ASCII letter, so indices in the folded
 * string are valid indices in `text.normalize('NFC')`.
 */
export function fold(text: string): string {
  return Array.from(text.normalize('NFC'), (ch) =>
    ch === 'đ' || ch === 'Đ'
      ? 'd'
      : ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(),
  ).join('');
}
