import { BadRequestException } from '@nestjs/common';
import { moveToDay, resolveOccurredAt } from './occurred-at';

// 2026-10-14 15:30 in Vietnam
const now = new Date('2026-10-14T08:30:00Z');

describe('resolveOccurredAt', () => {
  it('is now without a day', () => {
    expect(resolveOccurredAt(undefined, now)).toBe(now);
  });

  it('is now for today, even right after midnight in Vietnam', () => {
    expect(resolveOccurredAt('2026-10-14', now)).toBe(now);
    const justAfterMidnight = new Date('2026-10-13T17:05:00Z'); // 00:05 on the 14th
    expect(resolveOccurredAt('2026-10-14', justAfterMidnight)).toBe(
      justAfterMidnight,
    );
  });

  it('keeps the current time of day on a past day', () => {
    expect(resolveOccurredAt('2026-10-10', now).toISOString()).toBe(
      '2026-10-10T08:30:00.000Z',
    );
  });

  it('puts the day in Vietnam time, not in UTC', () => {
    const late = new Date('2026-10-14T17:30:00Z'); // 00:30 on the 15th in Vietnam
    // 10 Oct 00:30 in Vietnam is still 9 Oct in UTC
    expect(resolveOccurredAt('2026-10-10', late).toISOString()).toBe(
      '2026-10-09T17:30:00.000Z',
    );
  });

  it('refuses a day in the future', () => {
    expect(() => resolveOccurredAt('2026-10-15', now)).toThrow(
      BadRequestException,
    );
  });

  it('refuses a day that does not exist', () => {
    expect(() => resolveOccurredAt('2026-02-31', now)).toThrow(
      BadRequestException,
    );
  });
});

describe('moveToDay', () => {
  // 2026-10-12 21:45 in Vietnam, an hour or so later than `now`'s time of day
  const evening = new Date('2026-10-12T14:45:00Z');

  it('keeps the time of day on the new day', () => {
    expect(moveToDay(evening, '2026-10-10', now).toISOString()).toBe(
      '2026-10-10T14:45:00.000Z',
    );
  });

  it('returns the same instant when the Vietnam day is unchanged', () => {
    expect(moveToDay(evening, '2026-10-12', now)).toBe(evening);
  });

  it('judges "the same day" in Vietnam time, not in UTC', () => {
    const afterMidnight = new Date('2026-10-11T17:30:00Z'); // 00:30 on the 12th
    expect(moveToDay(afterMidnight, '2026-10-12', now)).toBe(afterMidnight);
    expect(moveToDay(afterMidnight, '2026-10-11', now).toISOString()).toBe(
      '2026-10-10T17:30:00.000Z',
    );
  });

  it('moves to today with the kept time when that is not in the future', () => {
    const morning = new Date('2026-10-12T01:00:00Z'); // 08:00 in Vietnam
    expect(moveToDay(morning, '2026-10-14', now).toISOString()).toBe(
      '2026-10-14T01:00:00.000Z',
    );
  });

  it('never lands later than now when moving to today', () => {
    expect(moveToDay(evening, '2026-10-14', now)).toBe(now);
  });

  it('refuses a day in the future', () => {
    expect(() => moveToDay(evening, '2026-10-15', now)).toThrow(
      BadRequestException,
    );
  });

  it('refuses a day that does not exist, even when it would be a no-op', () => {
    expect(() => moveToDay(evening, '2026-02-31', now)).toThrow(
      BadRequestException,
    );
  });
});
