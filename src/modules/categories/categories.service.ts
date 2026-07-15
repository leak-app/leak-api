import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { CategoryType } from '@/generated/prisma/client';
import { CreateCategoryDto } from './dto/categories.dto';

@Injectable()
export class CategoryService {
  constructor(private readonly _prisma: PrismaService) {}

  async findAll(userId: string) {
    return this._prisma.category.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateCategoryDto) {
    return this._prisma.category.create({
      data: {
        name: dto.name,
        type: dto.type,
        userId,
      },
    });
  }

  async delete(userId: string, id: string) {
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
      { name: '💼 Lương', type: CategoryType.INCOME },
      { name: '⏱️ Làm thêm', type: CategoryType.INCOME },
      { name: '🎁 Quà tặng', type: CategoryType.INCOME },
      { name: '💵 Thu nhập khác', type: CategoryType.INCOME },
      // Expense
      { name: '🍴 Ăn uống', type: CategoryType.EXPENSE },
      { name: '🚗 Di chuyển', type: CategoryType.EXPENSE },
      { name: '🏠 Nhà cửa & Hóa đơn', type: CategoryType.EXPENSE },
      { name: '🎮 Giải trí', type: CategoryType.EXPENSE },
      { name: '🛍️ Mua sắm', type: CategoryType.EXPENSE },
      { name: '💸 Chi tiêu khác', type: CategoryType.EXPENSE },
      // Investment
      { name: '📈 Cổ phiếu', type: CategoryType.INVESTMENT },
      { name: '🪙 Tiền điện tử', type: CategoryType.INVESTMENT },
      { name: '🏦 Tiết kiệm', type: CategoryType.INVESTMENT },
      { name: '🏡 Vàng & Bất động sản', type: CategoryType.INVESTMENT },
    ];

    await this._prisma.category.createMany({
      data: defaults.map((item) => ({
        ...item,
        userId,
      })),
    });
  }
}
