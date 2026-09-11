import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

export interface PasswordResetTokenModel {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class PasswordResetRepository {
  constructor(private readonly _prisma: PrismaService) {}

  async create(data: {
    token: string;
    userId: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenModel> {
    return (this._prisma as any).passwordResetToken.create({
      data,
    });
  }

  async findByToken(token: string): Promise<PasswordResetTokenModel | null> {
    return (this._prisma as any).passwordResetToken.findUnique({
      where: { token },
    });
  }

  async invalidatePreviousTokens(userId: string): Promise<void> {
    await (this._prisma as any).passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  async markAsUsed(id: string): Promise<void> {
    await (this._prisma as any).passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
