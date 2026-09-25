import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { CreateGoalDto, UpdateGoalDto } from './dto/goals.dto';

@Injectable()
export class GoalService {
  constructor(private readonly _prisma: PrismaService) {}

  async findAll(userId: string) {
    return this._prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateGoalDto) {
    return this._prisma.goal.create({
      data: {
        name: dto.name,
        targetAmount: dto.targetAmount,
        userId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateGoalDto) {
    return this._prisma.goal.update({
      where: {
        id,
        userId,
      },
      data: {
        name: dto.name,
        targetAmount: dto.targetAmount,
      },
    });
  }

  async delete(userId: string, id: string) {
    return this._prisma.goal.delete({
      where: {
        id,
        userId,
      },
    });
  }
}
