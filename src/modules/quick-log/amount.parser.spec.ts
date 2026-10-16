import { findAmounts } from './amount.parser';
import { fold } from './text';

const amounts = (text: string) => findAmounts(fold(text)).map((m) => m.value);

describe('fold', () => {
  it('keeps indices aligned with the NFC original', () => {
    for (const s of [
      '55k phở bò',
      'Đi Grab 42K',
      'cà phê ☕ 30k',
      'trả góp 1tr2',
    ]) {
      expect(fold(s).length).toBe(s.normalize('NFC').length);
    }
  });

  it('strips Vietnamese diacritics and lowercases', () => {
    expect(fold('Phở BÒ đá')).toBe('pho bo da');
  });
});

describe('findAmounts', () => {
  it.each([
    ['55k phở bò', 55_000],
    ['55K', 55_000],
    ['1.5tr', 1_500_000],
    ['1,5tr', 1_500_000],
    ['1tr2', 1_200_000],
    ['1tr25', 1_250_000],
    ['2 triệu', 2_000_000],
    ['50 nghìn', 50_000],
    ['50 ngàn', 50_000],
    ['1k5', 1_500],
    ['55.000', 55_000],
    ['55,000đ', 55_000],
    ['1.250.000', 1_250_000],
    ['55000', 55_000],
    ['grab 42k thẻ techcombank', 42_000],
  ])('%s -> %i', (text, value) => {
    expect(amounts(text)).toEqual([value]);
  });

  it.each(['2 ly cà phê', '2kg gạo', '15/10 cà phê', 'ăn sáng', '', '   '])(
    'finds no amount in %j',
    (text) => {
      expect(amounts(text)).toEqual([]);
    },
  );

  it('returns every candidate so the caller can refuse to guess', () => {
    expect(amounts('50k ship 20k')).toEqual([50_000, 20_000]);
  });

  it('reports the span for description cleanup', () => {
    const folded = fold('55k pho bo');
    expect(findAmounts(folded)[0]).toMatchObject({ start: 0, end: 3 });
  });
});
