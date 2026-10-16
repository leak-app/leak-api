import { learnKeywords } from './learned-keywords';

const row = (description: string | null, categoryId: string) => ({
  description,
  categoryId,
});

describe('learnKeywords', () => {
  it('keeps the category the user chose most often for a description', () => {
    const learned = learnKeywords([
      row('phở bò', 'food'),
      row('phở bò', 'food'),
      row('phở bò', 'other'),
    ]);
    expect(learned).toEqual({ 'pho bo': 'food' });
  });

  it('drops a description whose categories tie', () => {
    expect(learnKeywords([row('be', 'move'), row('be', 'food')])).toEqual({});
  });

  it('treats case, diacritics and spacing as the same description', () => {
    const learned = learnKeywords([
      row('Phở  Bò', 'food'),
      row(' phở bò ', 'food'),
    ]);
    expect(learned).toEqual({ 'pho bo': 'food' });
  });

  it('ignores missing, blank and one-character descriptions', () => {
    expect(
      learnKeywords([row(null, 'a'), row('   ', 'a'), row('x', 'a')]),
    ).toEqual({});
  });

  it('returns an empty map for no history', () => {
    expect(learnKeywords([])).toEqual({});
  });
});
