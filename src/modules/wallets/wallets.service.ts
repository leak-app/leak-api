import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { CreateWalletDto, UpdateWalletDto } from './dto/wallets.dto';

@Injectable()
export class WalletService {
  constructor(private readonly _prisma: PrismaService) {}

  async findAll(userId: string) {
    return this._prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateWalletDto) {
    return this._prisma.account.create({
      data: {
        name: dto.name,
        type: dto.type,
        initialBalance: dto.initialBalance,
        currentBalance: dto.initialBalance, // Initially set to initial balance
        userId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateWalletDto) {
    return this._prisma.account.update({
      where: {
        id,
        userId,
      },
      data: {
        name: dto.name,
        currentBalance: dto.currentBalance,
      },
    });
  }

  async delete(userId: string, id: string) {
    return this._prisma.account.delete({
      where: {
        id,
        userId,
      },
    });
  }
}
