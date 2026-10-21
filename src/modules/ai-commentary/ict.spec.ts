import { ictDayStart, ictHour, ictMonthRange } from './ict';

describe('ictHour', () => {
  it('reads the Vietnam hour, not the UTC hour', () => {
    expect(ictHour(new Date('2026-10-12T16:30:00Z'))).toBe(23);
    expect(ictHour(new Date('2026-10-12T21:00:00Z'))).toBe(4); // already the 13th in Vietnam
  });
});

describe('ictDayStart', () => {
  it('is midnight in Vietnam, expressed in UTC', () => {
    // 03:00 on the 13th in Vietnam
    expect(ictDayStart(new Date('2026-10-12T20:00:00Z')).toISOString()).toBe(
      '2026-10-12T17:00:00.000Z',
    );
  });
});

describe('ictMonthRange', () => {
  it('uses the Vietnam month even when UTC is still in the previous one', () => {
    // 01:00 on 1 November in Vietnam
    const range = ictMonthRange(new Date('2026-10-31T18:00:00Z'));
    expect(range.month).toBe(11);
    expect(range.year).toBe(2026);
    expect(range.start.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-30T17:00:00.000Z');
  });

  it('rolls December into January', () => {
    const range = ictMonthRange(new Date('2026-12-15T05:00:00Z'));
    expect(range.month).toBe(12);
    expect(range.end.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });
});
