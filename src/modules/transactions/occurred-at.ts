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

  const ictNow = now.getTime() + ICT_OFFSET_MS;
  const todayUtc = Math.floor(ictNow / DAY_MS) * DAY_MS;
  if (pickedUtc > todayUtc) {
    throw new BadRequestException(
      'Không thể ghi giao dịch ở ngày trong tương lai',
    );
  }
  if (pickedUtc === todayUtc) return now;

  const timeOfDay = ictNow - todayUtc;
  return new Date(pickedUtc + timeOfDay - ICT_OFFSET_MS);
}
