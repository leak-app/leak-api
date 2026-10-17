export interface AmountMatch {
  /** Whole VND. */
  value: number;
  /** Indices into the folded string (and the NFC original). */
  start: number;
  end: number;
}

const UNIT_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  nghin: 1_000,
  ngan: 1_000,
  tr: 1_000_000,
  trieu: 1_000_000,
};

// JS `\b` is ASCII-only, so boundaries are explicit Unicode lookarounds.
// Three shapes: "55.000" (grouped), "55k" / "1.5tr" / "1tr2" (unit), "55000" (plain, 4-9 digits).
const AMOUNT_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\d.,])(?:` +
    String.raw`(?<grouped>\d{1,3}(?:[.,]\d{3})+)(?:\s*(?:d|dong))?` +
    String.raw`|(?<num>\d+(?:[.,]\d+)?)\s*(?<unit>k|nghin|ngan|tr|trieu)(?<tail>\d{1,3})?` +
    String.raw`|(?<plain>\d{4,9})(?:\s*(?:d|dong))?` +
    String.raw`)(?![\p{L}\d])`,
  'gu',
);

/** Money tokens in an already folded string. Bare small numbers ("2 ly") never match. */
export function findAmounts(folded: string): AmountMatch[] {
  const found: AmountMatch[] = [];
  for (const m of folded.matchAll(AMOUNT_PATTERN)) {
    const { grouped, num, unit, tail, plain } = m.groups ?? {};
    const value = grouped
      ? Number(grouped.replace(/[.,]/g, ''))
      : plain
        ? Number(plain)
        : unitValue(num, unit, tail);
    if (value !== null && Number.isFinite(value) && value > 0) {
      found.push({ value, start: m.index, end: m.index + m[0].length });
    }
  }
  return found;
}

function unitValue(num: string, unit: string, tail?: string): number | null {
  const hasDecimal = /[.,]/.test(num);
  if (tail && hasDecimal) return null; // "1.5tr2" is not a real amount
  const base = Number(tail ? `${num}.${tail}` : num.replace(',', '.'));
  return Math.round(base * UNIT_MULTIPLIER[unit]);
}
