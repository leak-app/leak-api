import { Prisma, ValuationKind } from '@/generated/prisma/client';

/** Vietnam has no daylight saving time, so a fixed +7 h offset is exact. */
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

type Money = Prisma.Decimal | number | string;

const dec = (value: Money) => new Prisma.Decimal(value);

/** Today in Asia/Ho_Chi_Minh as a UTC-midnight Date, which Prisma stores as a DATE. */
export function ictToday(now: Date): Date {
  const shifted = new Date(now.getTime() + ICT_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ),
  );
}

/** Calendar month in Asia/Ho_Chi_Minh as `year * 12 + month`, so months compare and subtract. */
function ictMonthIndex(date: Date): number {
  const shifted = new Date(date.getTime() + ICT_OFFSET_MS);
  return shifted.getUTCFullYear() * 12 + shifted.getUTCMonth();
}

export interface ValuationInput {
  /** Ledger balance of the wallet right now. */
  currentBalance: Money;
  initialBalance: Money;
  /** The latest non-deleted update of the wallet, if any. */
  previousBalance: Money | null;
  /** What the user typed. */
  enteredBalance: Money;
  /** Honoured only for the first update. */
  asBaseline: boolean;
  /** Liquid wallets: always a baseline, however many updates came before. */
  forceBaseline?: boolean;
}

export interface ValuationResult {
  kind: ValuationKind;
  previousBalance: Prisma.Decimal;
  netFlow: Prisma.Decimal;
  gain: Prisma.Decimal;
  /** What the ledger must add to the wallet so it shows the entered balance. */
  adjustment: Prisma.Decimal;
}

/**
 * Splits the change since the last update into money the user moved
 * (`netFlow`, already in the ledger balance) and profit (`gain`).
 *
 * After an update the ledger balance moves only through deposits and
 * withdrawals, so `currentBalance − previousBalance` is exactly that flow,
 * including a transaction entered late with an earlier date.
 */
export function computeValuation(input: ValuationInput): ValuationResult {
  const current = dec(input.currentBalance);
  const entered = dec(input.enteredBalance);
  const hasPrevious = input.previousBalance !== null;
  const previousBalance = dec(input.previousBalance ?? input.initialBalance);

  const kind =
    input.forceBaseline || (!hasPrevious && input.asBaseline)
      ? ValuationKind.BASELINE
      : ValuationKind.UPDATE;
  const adjustment = entered.minus(current);
  const netFlow = current.minus(previousBalance);
  const gain =
    kind === ValuationKind.BASELINE
      ? new Prisma.Decimal(0)
      : entered.minus(previousBalance).minus(netFlow);

  return { kind, previousBalance, netFlow, gain, adjustment };
}

export interface ReturnInput {
  kind: ValuationKind;
  previousBalance: Money;
  netFlow: Money;
  gain: Money;
}

/**
 * Estimated return of one period, in percent with one decimal:
 * gain ÷ (previous balance + money moved in). Flows are assumed to be at the
 * start of the period. `null` for a baseline or when there is nothing to divide by.
 */
export function periodReturn(v: ReturnInput): number | null {
  if (v.kind === ValuationKind.BASELINE) return null;
  const base = dec(v.previousBalance).plus(Prisma.Decimal.max(v.netFlow, 0));
  if (!base.isPositive() || base.isZero()) return null;
  return roundPercent(dec(v.gain).div(base));
}

export interface WalletTotals {
  /** Money the user put in: the opening or baseline balance plus all net flows. */
  capital: Prisma.Decimal;
  profit: Prisma.Decimal;
  /** Percent with one decimal; `null` when capital is not positive. */
  returnPercent: number | null;
}

/**
 * `gains` are the gains of the wallet's non-deleted updates. The wallet balance
 * already contains them, so capital is what is left once they are taken out.
 */
export function walletTotals(
  currentBalance: Money,
  gains: readonly Money[],
): WalletTotals {
  const profit = gains.reduce<Prisma.Decimal>(
    (sum, gain) => sum.plus(gain),
    new Prisma.Decimal(0),
  );
  const capital = dec(currentBalance).minus(profit);
  const returnPercent =
    capital.isPositive() && !capital.isZero()
      ? roundPercent(profit.div(capital))
      : null;
  return { capital, profit, returnPercent };
}

/**
 * A wallet is stale when it has not been updated in the current calendar month
 * (Asia/Ho_Chi_Minh). A wallet that was never updated counts from its creation,
 * so a wallet created this month is not nagged yet.
 */
export function isStale(
  lastValuedAt: Date | null,
  createdAt: Date,
  now: Date,
): boolean {
  return ictMonthIndex(lastValuedAt ?? createdAt) < ictMonthIndex(now);
}

/** Sum of the gains entered in the same calendar month as `now` (Asia/Ho_Chi_Minh). */
export function profitInMonth(
  valuations: readonly { valuedAt: Date; gain: Money }[],
  now: Date,
): Prisma.Decimal {
  const month = ictMonthIndex(now);
  return valuations
    .filter((v) => ictMonthIndex(v.valuedAt) === month)
    .reduce<Prisma.Decimal>(
      (sum, v) => sum.plus(v.gain),
      new Prisma.Decimal(0),
    );
}

function roundPercent(ratio: Prisma.Decimal): number {
  return ratio
    .times(100)
    .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

export interface SeriesValuation extends ReturnInput {
  accountId: string;
  valuedAt: Date;
  balance: Money;
}

export interface MonthPoint {
  /** "2026-10" */
  month: string;
  /** Sum over wallets of the last balance entered up to the end of the month. */
  balance: Prisma.Decimal;
  /** Sum of the gains entered during the month. */
  profit: Prisma.Decimal;
  /** Estimated return of the month in percent; `null` without updates or a base. */
  returnPercent: number | null;
}

const monthKey = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/**
 * One point per calendar month (Asia/Ho_Chi_Minh), oldest first, ending with the
 * current month and at most `months` long. It starts at the first month that has
 * an update, so a new user does not get a run of empty months.
 * `valuations` must be in the order they were entered.
 */
export function monthlySeries(
  valuations: readonly SeriesValuation[],
  now: Date,
  months: number,
): MonthPoint[] {
  if (valuations.length === 0) return [];

  const withMonth = valuations.map((v) => ({
    ...v,
    monthIndex: ictMonthIndex(v.valuedAt),
  }));
  const last = ictMonthIndex(now);
  const first = Math.max(
    last - months + 1,
    Math.min(...withMonth.map((v) => v.monthIndex)),
  );

  const points: MonthPoint[] = [];
  for (let index = first; index <= last; index++) {
    const latestPerWallet = new Map<string, Money>();
    let profit = new Prisma.Decimal(0);
    let base = new Prisma.Decimal(0);
    for (const v of withMonth) {
      if (v.monthIndex > index) continue;
      latestPerWallet.set(v.accountId, v.balance);
      if (v.monthIndex !== index) continue;
      profit = profit.plus(v.gain);
      if (v.kind !== ValuationKind.BASELINE) {
        base = base
          .plus(dec(v.previousBalance))
          .plus(Prisma.Decimal.max(v.netFlow, 0));
      }
    }
    const balance = [...latestPerWallet.values()].reduce<Prisma.Decimal>(
      (sum, value) => sum.plus(value),
      new Prisma.Decimal(0),
    );
    points.push({
      month: monthKey(index),
      balance,
      profit,
      returnPercent: base.gt(0) ? roundPercent(profit.div(base)) : null,
    });
  }
  return points;
}
