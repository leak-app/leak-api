import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import {
  GoalContributionSource,
  GoalContributionType,
  Prisma,
} from '@/generated/prisma/client';
import { planContributionChanges } from '@/modules/transactions/ledger.calculator';
import { LedgerService } from '@/modules/transactions/ledger.service';
import { WalletResolver } from '@/modules/transactions/wallet-resolver.service';
import {
  CreateGoalDto,
  GoalContributionsQueryDto,
  GoalMovementDto,
  UpdateGoalDto,
} from './dto/goals.dto';

/** "2027-03-01" → a UTC midnight Date, which Prisma stores as a DATE. */
const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type MovementType = 'DEPOSIT' | 'WITHDRAWAL';

@Injectable()
export class GoalService {
  constructor(
    private readonly _prisma: PrismaService,
    private readonly _ledger: LedgerService,
    private readonly _wallets: WalletResolver,
  ) {}

  async findAll(userId: string) {
    return this._prisma.goal.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateGoalDto) {
    return this._prisma.goal.create({
      data: {
        name: dto.name,
        emoji: dto.emoji,
        targetAmount: dto.targetAmount,
        targetDate: dto.targetDate ? toDate(dto.targetDate) : undefined,
        userId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateGoalDto) {
    await this._findActive(this._prisma, userId, id);
    return this._prisma.goal.update({
      where: { id },
      data: {
        name: dto.name,
        emoji: dto.emoji,
        targetAmount: dto.targetAmount,
        targetDate:
          dto.targetDate === undefined
            ? undefined
            : dto.targetDate === null
              ? null
              : toDate(dto.targetDate),
      },
    });
  }

  async delete(userId: string, id: string) {
    return this._prisma.$transaction(async (tx) => {
      const goal = await this._lockActive(tx, userId, id);
      if (!goal.savedAmount.isZero()) {
        throw new ConflictException('Hãy rút hết tiền trước khi xóa mục tiêu');
      }
      return tx.goal.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    });
  }

  async deposit(userId: string, id: string, dto: GoalMovementDto) {
    return this._prisma.$transaction((tx) =>
      this.moveInTx(tx, userId, id, dto, 'DEPOSIT'),
    );
  }

  async withdraw(userId: string, id: string, dto: GoalMovementDto) {
    return this._prisma.$transaction((tx) =>
      this.moveInTx(tx, userId, id, dto, 'WITHDRAWAL'),
    );
  }

  /**
   * Runs inside the caller's transaction so other writers (the leak-reclaim
   * pipeline) commit together with it.
   */
  async moveInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    dto: GoalMovementDto,
    type: MovementType,
    source: GoalContributionSource = GoalContributionSource.MANUAL,
  ) {
    const goal = await this._lockActive(tx, userId, id);
    const accountId = await this._wallets.resolve(tx, userId, dto.accountId);
    const amount = new Prisma.Decimal(dto.amount);

    if (type === 'WITHDRAWAL' && amount.greaterThan(goal.savedAmount)) {
      throw new ConflictException('Số tiền rút vượt quá số đã tích lũy');
    }

    const contribution = await tx.goalContribution.create({
      data: {
        goalId: id,
        accountId,
        userId,
        type: GoalContributionType[type],
        source,
        amount,
        note: dto.note,
      },
    });
    await this._ledger.apply(tx, planContributionChanges(contribution));
    const updated = await tx.goal.update({
      where: { id },
      data: {
        savedAmount:
          type === 'DEPOSIT' ? { increment: amount } : { decrement: amount },
      },
    });
    return { goal: updated, contribution };
  }

  async contributions(
    userId: string,
    id: string,
    query: GoalContributionsQueryDto,
  ) {
    await this._findActive(this._prisma, userId, id);
    const where = { goalId: id, userId };
    const [contributions, total] = await Promise.all([
      this._prisma.goalContribution.findMany({
        where,
        include: { account: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this._prisma.goalContribution.count({ where }),
    ]);
    return {
      contributions,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Locks the row, then reads it, so concurrent movements run one after another. */
  private async _lockActive(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    await tx.$queryRaw`SELECT id FROM goals WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`;
    return this._findActive(tx, userId, id);
  }

  private async _findActive(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
    id: string,
  ) {
    const goal = await client.goal.findFirst({
      where: { id, userId, isDeleted: false },
    });
    if (!goal) throw new NotFoundException('Không tìm thấy mục tiêu');
    return goal;
  }
}
