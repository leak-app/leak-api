import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { AccountType } from '@/generated/prisma/client';
import type {
  UserCreateInput,
  UserModel,
  UserUpdateInput,
} from '@/generated/prisma/models';

@Injectable()
export class UserRepository {
  constructor(private readonly _prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserModel | null> {
    return this._prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string): Promise<UserModel | null> {
    return this._prisma.user.findUnique({
      where: { id },
    });
  }

  /** Every user starts with a cash wallet so transactions always have a wallet to land in. */
  async create(data: UserCreateInput): Promise<UserModel> {
    return this._prisma.user.create({
      data: {
        ...data,
        accounts: {
          create: {
            name: 'Tiền mặt',
            type: AccountType.LIQUID,
            initialBalance: 0,
            currentBalance: 0,
          },
        },
      },
    });
  }

  async update(id: string, data: UserUpdateInput): Promise<UserModel> {
    return this._prisma.user.update({
      where: { id },
      data,
    });
  }
}
