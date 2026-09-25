import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { CategoryType } from '@/generated/prisma/client';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';

@Injectable()
export class CategoryService {
  constructor(private readonly _prisma: PrismaService) {}

  async findAll(userId: string) {
    return this._prisma.category.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateCategoryDto) {
    return this._prisma.category.create({
      data: {
        name: dto.name,
        emoji: dto.emoji,
        type: dto.type,
        userId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    return this._prisma.category.update({
      where: {
        id,
        userId,
      },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.emoji !== undefined && { emoji: dto.emoji }),
        ...(dto.type !== undefined && { type: dto.type }),
      },
    });
  }

  async delete(userId: string, id: string) {
    // Counts soft-deleted transactions on purpose: the Restrict FK blocks a hard
    // delete while any transaction row, deleted or not, still references the category.
    const transactionCount = await this._prisma.transaction.count({
      where: { categoryId: id, userId },
    });

    if (transactionCount > 0) {
      return this._prisma.category.update({
        where: {
          id,
          userId,
        },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    }

    return this._prisma.category.delete({
      where: {
        id,
        userId,
      },
    });
  }

  async seedDefaultCategories(userId: string): Promise<void> {
    const defaults = [
      // Income
      { name: 'Lương', emoji: '💼', type: CategoryType.INCOME },
      { name: 'Làm thêm', emoji: '⏱️', type: CategoryType.INCOME },
      { name: 'Quà tặng', emoji: '🎁', type: CategoryType.INCOME },
      { name: 'Thu nhập khác', emoji: '💵', type: CategoryType.INCOME },
      // Expense
      { name: 'Ăn uống', emoji: '🍴', type: CategoryType.EXPENSE },
      { name: 'Di chuyển', emoji: '🚗', type: CategoryType.EXPENSE },
      { name: 'Nhà cửa & Hóa đơn', emoji: '🏠', type: CategoryType.EXPENSE },
      { name: 'Giải trí', emoji: '🎮', type: CategoryType.EXPENSE },
      { name: 'Mua sắm', emoji: '🛍️', type: CategoryType.EXPENSE },
      { name: 'Chi tiêu khác', emoji: '💸', type: CategoryType.EXPENSE },
      // Investment
      { name: 'Cổ phiếu', emoji: '📈', type: CategoryType.INVESTMENT },
      { name: 'Tiền điện tử', emoji: '🪙', type: CategoryType.INVESTMENT },
      { name: 'Tiết kiệm', emoji: '🏦', type: CategoryType.INVESTMENT },
      {
        name: 'Vàng & Bất động sản',
        emoji: '🏡',
        type: CategoryType.INVESTMENT,
      },
    ];

    await this._prisma.category.createMany({
      data: defaults.map((item) => ({
        ...item,
        userId,
      })),
    });
  }
}
