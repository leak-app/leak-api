import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import {
  AccountType,
  Prisma,
  type AccountValuation,
} from '@/generated/prisma/client';
import { planValuationChanges } from '@/modules/transactions/ledger.calculator';
import { LedgerService } from '@/modules/transactions/ledger.service';
import { CreateValuationDto } from './dto/valuations.dto';
import {
  computeValuation,
  ictToday,
  isStale,
  monthlySeries,
  periodReturn,
  profitInMonth,
  walletTotals,
} from './portfolio.calculator';

/** "2026-11-01" → a UTC-midnight Date, which Prisma stores as a DATE. */
const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface ValuationSummary {
  hasValuations: boolean;
  lastValuedAt: Date | null;
  /** Balance of the latest update; the next update is measured from it. */
  lastBalance: Prisma.Decimal | null;
  profit: Prisma.Decimal;
  capital: Prisma.Decimal;
  returnPercent: number | null;
  /** Profit entered during the current calendar month. */
  monthProfit: Prisma.Decimal;
  isStale: boolean;
}

interface WalletForSummary {
  id: string;
  type: AccountType;
  currentBalance: Prisma.Decimal;
  createdAt: Date;
}

@Injectable()
export class ValuationsService {
  constructor(
    private readonly _prisma: PrismaService,
    private readonly _ledger: LedgerService,
  ) {}

  async create(userId: string, accountId: string, dto: CreateValuationDto) {
    return this._prisma.$transaction(async (tx) => {
      const account = await this._lockWallet(tx, userId, accountId);

      if (
        !new Prisma.Decimal(dto.expectedBalance).equals(account.currentBalance)
      ) {
        throw new ConflictException(
          'Số dư ví vừa thay đổi. Kiểm tra lại rồi lưu lần nữa.',
        );
      }

      // A liquid wallet has no profit to track: every entry resets the balance
      // and later movements are counted from it.
      const isLiquid = account.type === AccountType.LIQUID;
      const previous = await this._latest(tx, accountId);
      if (dto.asBaseline && previous && !isLiquid) {
        throw new BadRequestException(
          'Chỉ lần cập nhật đầu tiên mới có thể đặt làm mốc',
        );
      }

      const today = ictToday(new Date());
      const valuedAt = dto.valuedAt ? toDate(dto.valuedAt) : today;
      if (valuedAt > today) {
        throw new BadRequestException('Ngày cập nhật không được ở tương lai');
      }
      if (previous && valuedAt < previous.valuedAt) {
        throw new BadRequestException(
          'Ngày cập nhật không được sớm hơn lần cập nhật trước',
        );
      }

      const result = computeValuation({
        currentBalance: account.currentBalance,
        initialBalance: account.initialBalance,
        previousBalance: previous?.balance ?? null,
        enteredBalance: dto.balance,
        asBaseline: isLiquid || (dto.asBaseline ?? false),
        forceBaseline: isLiquid,
      });

      const valuation = await tx.accountValuation.create({
        data: {
          accountId,
          userId,
          kind: result.kind,
          valuedAt,
          previousBalance: result.previousBalance,
          netFlow: result.netFlow,
          balance: dto.balance,
          gain: result.gain,
          adjustment: result.adjustment,
        },
      });
      await this._ledger.apply(tx, planValuationChanges(valuation));
      return this._withReturn(valuation);
    });
  }

  /** Newest first. Archived wallets keep their history, so only ownership is checked. */
  async list(userId: string, accountId: string) {
    const account = await this._prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Không tìm thấy ví');

    const valuations = await this._prisma.accountValuation.findMany({
      where: { accountId, userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
    return valuations.map((v) => this._withReturn(v));
  }

  /** Undo. Only the latest update can go, because later periods are measured from it. */
  async delete(userId: string, id: string) {
    return this._prisma.$transaction(async (tx) => {
      const found = await tx.accountValuation.findFirst({
        where: { id, userId, isDeleted: false },
        select: { accountId: true },
      });
      if (!found) throw new NotFoundException('Không tìm thấy lần cập nhật');

      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${found.accountId} AND user_id = ${userId} FOR UPDATE`;
      const latest = await this._latest(tx, found.accountId);
      if (!latest || latest.id !== id) {
        throw new ConflictException(
          'Chỉ có thể hoàn tác lần cập nhật gần nhất',
        );
      }

      const deleted = await tx.accountValuation.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await this._ledger.apply(tx, planValuationChanges(deleted, true));
      return this._withReturn(deleted);
    });
  }

  /** Profit figures for the investment wallets among `wallets`, keyed by wallet id. */
  async summarize(
    userId: string,
    wallets: readonly WalletForSummary[],
  ): Promise<Map<string, ValuationSummary>> {
    const investment = wallets.filter((w) => w.type === AccountType.INVESTMENT);
    if (investment.length === 0) return new Map();
    const valuations = await this._entered(
      userId,
      investment.map((w) => w.id),
    );
    return this._summaries(investment, valuations);
  }

  /** Everything the Investment page shows: totals, per-wallet figures and monthly points. */
  async portfolio(userId: string, months: number) {
    const wallets = await this._prisma.account.findMany({
      where: { userId, isDeleted: false, type: AccountType.INVESTMENT },
      orderBy: { createdAt: 'asc' },
    });
    const valuations = await this._entered(
      userId,
      wallets.map((w) => w.id),
    );
    const summaries = this._summaries(wallets, valuations);

    const rows = wallets.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      currentBalance: wallet.currentBalance,
      ...summaries.get(wallet.id),
    }));
    const value = wallets.reduce(
      (sum, w) => sum.plus(w.currentBalance),
      new Prisma.Decimal(0),
    );
    const profit = rows.reduce(
      (sum, r) => sum.plus(r.profit),
      new Prisma.Decimal(0),
    );
    const totals = walletTotals(
      value,
      rows.map((r) => r.profit),
    );

    return {
      totals: {
        value,
        capital: totals.capital,
        profit,
        returnPercent: totals.returnPercent,
        hasValuations: valuations.length > 0,
      },
      wallets: rows,
      months: monthlySeries(valuations, new Date(), months),
      staleWalletIds: rows.filter((r) => r.isStale).map((r) => r.id),
    };
  }

  /**
   * True when one of the wallets has a balance update entered after `moment`.
   * That update already counted any deposit or withdrawal made before it.
   */
  async hasUpdateAfter(
    tx: Prisma.TransactionClient,
    accountIds: string[],
    moment: Date,
  ): Promise<boolean> {
    const count = await tx.accountValuation.count({
      where: {
        accountId: { in: accountIds },
        // Liquid adjustments carry no profit, so they never "count" a movement.
        account: { type: AccountType.INVESTMENT },
        isDeleted: false,
        createdAt: { gt: moment },
      },
    });
    return count > 0;
  }

  /** Non-deleted updates of the given wallets, in the order they were entered. */
  private _entered(userId: string, accountIds: string[]) {
    return this._prisma.accountValuation.findMany({
      where: { userId, isDeleted: false, accountId: { in: accountIds } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private _summaries(
    wallets: readonly WalletForSummary[],
    valuations: readonly AccountValuation[],
  ): Map<string, ValuationSummary> {
    const now = new Date();
    const summaries = new Map<string, ValuationSummary>();
    for (const wallet of wallets) {
      const own = valuations.filter((v) => v.accountId === wallet.id);
      const lastValuedAt = own.at(-1)?.valuedAt ?? null;
      const totals = walletTotals(
        wallet.currentBalance,
        own.map((v) => v.gain),
      );
      summaries.set(wallet.id, {
        hasValuations: own.length > 0,
        lastValuedAt,
        lastBalance: own.at(-1)?.balance ?? null,
        ...totals,
        monthProfit: profitInMonth(own, now),
        isStale: isStale(lastValuedAt, wallet.createdAt, now),
      });
    }
    return summaries;
  }

  private _withReturn(valuation: AccountValuation) {
    return { ...valuation, periodReturn: periodReturn(valuation) };
  }

  private _latest(tx: Prisma.TransactionClient, accountId: string) {
    return tx.accountValuation.findFirst({
      where: { accountId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Locks the row before reading it, so two updates of one wallet run one after another. */
  private async _lockWallet(
    tx: Prisma.TransactionClient,
    userId: string,
    accountId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId} AND user_id = ${userId} FOR UPDATE`;
    const account = await tx.account.findFirst({
      where: { id: accountId, userId, isDeleted: false },
    });
    if (!account) throw new NotFoundException('Không tìm thấy ví');
    return account;
  }
}
