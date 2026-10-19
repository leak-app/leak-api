import { BadRequestException } from '@nestjs/common';

/** Vietnam has no daylight saving time, so a fixed +7 h offset is exact. */
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a transaction happened, from the day the user picked (`YYYY-MM-DD`, Asia/Ho_Chi_Minh).
 * The time of day is the current one, so several entries for one past day keep the order they
 * were typed in. Without a day, or for today, it is `now`. Every report reads this as the
 * transaction's date. A day in the future is refused.
 */
export function resolveOccurredAt(
  occurredOn: string | undefined,
  now: Date = new Date(),
): Date {
  if (!occurredOn) return now;

  const pickedUtc = parsePastOrToday(occurredOn, now);
  const ictNow = now.getTime() + ICT_OFFSET_MS;
  const todayUtc = startOfDayUtc(ictNow);
  if (pickedUtc === todayUtc) return now;

  const timeOfDay = ictNow - todayUtc;
  return new Date(pickedUtc + timeOfDay - ICT_OFFSET_MS);
}

/**
 * Moves an existing transaction to another day (`YYYY-MM-DD`, Asia/Ho_Chi_Minh)
 * and keeps its time of day, so the order of entries within a day survives.
 * The same Vietnam day returns `current` untouched, so an edit that does not
 * change the date never rewrites `createdAt`. Never later than `now`.
 */
export function moveToDay(
  current: Date,
  occurredOn: string,
  now: Date = new Date(),
): Date {
  const pickedUtc = parsePastOrToday(occurredOn, now);

  const ictCurrent = current.getTime() + ICT_OFFSET_MS;
  const currentDayUtc = startOfDayUtc(ictCurrent);
  if (pickedUtc === currentDayUtc) return current;

  const moved = new Date(
    pickedUtc + (ictCurrent - currentDayUtc) - ICT_OFFSET_MS,
  );
  return moved.getTime() > now.getTime() ? now : moved;
}

/** UTC midnight of the day (Vietnam time) the given Vietnam-shifted instant falls on. */
function startOfDayUtc(ictMs: number): number {
  return Math.floor(ictMs / DAY_MS) * DAY_MS;
}

/** The picked day as UTC midnight; refuses a day that does not exist or lies after today. */
function parsePastOrToday(occurredOn: string, now: Date): number {
  const [year, month, day] = occurredOn.split('-').map(Number);
  const pickedUtc = Date.UTC(year, month - 1, day);
  const picked = new Date(pickedUtc);
  if (
    picked.getUTCFullYear() !== year ||
    picked.getUTCMonth() !== month - 1 ||
    picked.getUTCDate() !== day
  ) {
    throw new BadRequestException('Ngày giao dịch không hợp lệ');
  }

  if (pickedUtc > startOfDayUtc(now.getTime() + ICT_OFFSET_MS)) {
    throw new BadRequestException(
      'Không thể ghi giao dịch ở ngày trong tương lai',
    );
  }
  return pickedUtc;
}
