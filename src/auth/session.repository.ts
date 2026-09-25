import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import type {
  SessionCreateInput,
  SessionModel,
  SessionUncheckedCreateInput,
} from '@/generated/prisma/models';

@Injectable()
export class SessionRepository {
  constructor(private readonly _prisma: PrismaService) {}

  async create(
    data: SessionCreateInput | SessionUncheckedCreateInput,
  ): Promise<SessionModel> {
    return this._prisma.session.create({
      data: data,
    });
  }

  async findByToken(token: string): Promise<SessionModel | null> {
    return this._prisma.session.findUnique({
      where: { token },
    });
  }

  async findByUserId(userId: string): Promise<SessionModel[]> {
    return this._prisma.session.findMany({
      where: { userId },
    });
  }

  async revoke(hashedToken: string): Promise<SessionModel> {
    return this._prisma.session.update({
      where: { token: hashedToken },
      data: { isRevoked: true },
    });
  }

  async deleteMany(where: {
    userId?: string;
    expiresAt?: { lt: Date };
    isRevoked?: boolean;
  }): Promise<number> {
    const result = await this._prisma.session.deleteMany({
      where: where,
    });
    return result.count;
  }

  async findActiveByUserId(userId: string, now: Date): Promise<SessionModel[]> {
    return this._prisma.session.findMany({
      where: { userId, isRevoked: false, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Scoped by userId so a guessed id of another user changes nothing. */
  async revokeById(userId: string, id: number): Promise<number> {
    const result = await this._prisma.session.updateMany({
      where: { id, userId, isRevoked: false },
      data: { isRevoked: true },
    });
    return result.count;
  }

  async revokeAllExcept(
    userId: string,
    keepTokenHash: string,
  ): Promise<number> {
    const result = await this._prisma.session.updateMany({
      where: { userId, isRevoked: false, token: { not: keepTokenHash } },
      data: { isRevoked: true },
    });
    return result.count;
  }
}
