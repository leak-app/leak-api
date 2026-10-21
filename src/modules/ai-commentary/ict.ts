/** Vietnam has no daylight saving time, so a fixed +7 h offset is exact. */
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The hour of day (0 to 23) in Asia/Ho_Chi_Minh. */
export function ictHour(date: Date): number {
  return new Date(date.getTime() + ICT_OFFSET_MS).getUTCHours();
}

/** The instant the Vietnam day containing `date` began. */
export function ictDayStart(date: Date): Date {
  const shifted = date.getTime() + ICT_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - ICT_OFFSET_MS);
}

/** The Vietnam month containing `date`: `start` inclusive, `end` exclusive, `month` 1 to 12. */
export function ictMonthRange(date: Date): {
  start: Date;
  end: Date;
  month: number;
  year: number;
} {
  const shifted = new Date(date.getTime() + ICT_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - ICT_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - ICT_OFFSET_MS),
    month: month + 1,
    year,
  };
}
