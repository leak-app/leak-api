import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
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

  async create(data: UserCreateInput): Promise<UserModel> {
    return this._prisma.user.create({
      data,
    });
  }

  async update(id: string, data: UserUpdateInput): Promise<UserModel> {
    return this._prisma.user.update({
      where: { id },
      data,
    });
  }
}
