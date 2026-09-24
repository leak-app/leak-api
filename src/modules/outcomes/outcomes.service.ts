import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '@/common/prisma.service';
import { SpendOutcome, TransactionType } from '@/generated/prisma/client';
import { ReviewOutcomeDto } from './dto/outcomes.dto';

export const QUEUE_MIN_AGE_HOURS = 24;
export const QUEUE_MAX_AGE_DAYS = 7;
export const QUEUE_SESSION_SIZE = 5;

@Injectable()
export class OutcomesService {
  constructor(private readonly _prisma: PrismaService) {}

  /** Unreviewed expenses old enough to reflect on, but not so old they become a backlog. */
  async getQueue(userId: string, now: Date = new Date()) {
    const where = {
      userId,
      type: TransactionType.EXPENSE,
      outcome: SpendOutcome.UNREVIEWED,
      createdAt: {
        gt: dayjs(now).subtract(QUEUE_MAX_AGE_DAYS, 'day').toDate(),
        lte: dayjs(now).subtract(QUEUE_MIN_AGE_HOURS, 'hour').toDate(),
      },
    };

    const [items, total] = await Promise.all([
      this._prisma.transaction.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: 'asc' },
        take: QUEUE_SESSION_SIZE,
      }),
      this._prisma.transaction.count({ where }),
    ]);

    return { items, total };
  }

  async review(
    userId: string,
    transactionId: string,
    dto: ReviewOutcomeDto,
    now: Date = new Date(),
  ) {
    const transaction = await this._prisma.transaction.findFirst({
      where: { id: transactionId, userId },
    });

    // Same message for "missing" and "not yours" so ownership is not revealed.
    if (!transaction) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }
    if (transaction.type !== TransactionType.EXPENSE) {
      throw new BadRequestException('Chỉ có thể đánh giá khoản chi');
    }

    const outcome = SpendOutcome[dto.outcome];

    return this._prisma.transaction.update({
      where: { id: transactionId, userId },
      data: {
        outcome,
        leakReason:
          outcome === SpendOutcome.LEAK ? (dto.leakReason ?? null) : null,
        reviewedAt: now,
      },
      include: { category: true },
    });
  }
}
