import { z } from 'zod';
import { CategoryType } from '@/generated/prisma/client';

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Tên danh mục là bắt buộc'),
  emoji: z.string().optional(),
  type: z.nativeEnum(CategoryType),
});

export class CreateCategoryDto implements z.infer<typeof createCategorySchema> {
  name!: string;
  emoji?: string;
  type!: CategoryType;
}
