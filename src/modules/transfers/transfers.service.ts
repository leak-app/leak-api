import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { planTransferChanges } from '@/modules/transactions/ledger.calculator';
import { LedgerService } from '@/modules/transactions/ledger.service';
import { WalletResolver } from '@/modules/transactions/wallet-resolver.service';
import { ictToday } from '@/modules/valuations/portfolio.calculator';
import { ValuationsService } from '@/modules/valuations/valuations.service';
import { CreateTransferDto, ListTransfersQueryDto } from './dto/transfers.dto';

/** "2026-11-01" → a UTC-midnight Date, which Prisma stores as a DATE. */
const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const walletSelect = { select: { id: true, name: true } } as const;

@Injectable()
export class TransfersService {
  constructor(
    private readonly _prisma: PrismaService,
    private readonly _ledger: LedgerService,
    private readonly _wallets: WalletResolver,
    private readonly _valuations: ValuationsService,
  ) {}

  async create(userId: string, dto: CreateTransferDto) {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Ví nguồn và ví nhận phải khác nhau');
    }
    const occurredAt = dto.occurredAt ? toDate(dto.occurredAt) : null;
    if (occurredAt && occurredAt > ictToday(new Date())) {
      throw new BadRequestException('Ngày chuyển tiền không được ở tương lai');
    }

    return this._prisma.$transaction(async (tx) => {
      const fromAccountId = await this._wallets.resolveExplicit(
        tx,
        userId,
        dto.fromAccountId,
      );
      const toAccountId = await this._wallets.resolveExplicit(
        tx,
        userId,
        dto.toAccountId,
      );

      const transfer = await tx.transfer.create({
        data: {
          fromAccountId,
          toAccountId,
          userId,
          amount: dto.amount,
          note: dto.note || null,
          occurredAt: occurredAt ?? ictToday(new Date()),
        },
        include: { from: walletSelect, to: walletSelect },
      });
      await this._ledger.apply(tx, planTransferChanges(transfer));
      return transfer;
    });
  }

  /** Newest first; with `accountId`, only transfers into or out of that wallet. */
  async findAll(userId: string, query: ListTransfersQueryDto) {
    return this._prisma.transfer.findMany({
      where: {
        userId,
        isDeleted: false,
        ...(query.accountId && {
          OR: [
            { fromAccountId: query.accountId },
            { toAccountId: query.accountId },
          ],
        }),
      },
      include: { from: walletSelect, to: walletSelect },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async delete(userId: string, id: string) {
    return this._prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findFirst({
        where: { id, userId, isDeleted: false },
      });
      if (!transfer)
        throw new NotFoundException('Không tìm thấy lần chuyển tiền');

      // A balance update entered later already counted this transfer as money
      // moved, so deleting it now would turn that money into profit.
      const counted = await this._valuations.hasUpdateAfter(
        tx,
        [transfer.fromAccountId, transfer.toAccountId],
        transfer.createdAt,
      );
      if (counted) {
        throw new ConflictException(
          'Lần chuyển tiền này đã được tính trong một lần cập nhật số dư. Hãy hoàn tác lần cập nhật đó trước.',
        );
      }

      const deleted = await tx.transfer.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
        include: { from: walletSelect, to: walletSelect },
      });
      await this._ledger.apply(tx, planTransferChanges(deleted, true));
      return deleted;
    });
  }
}
