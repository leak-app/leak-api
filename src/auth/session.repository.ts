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
}
