import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UsePipes,
} from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import type { User } from '@/generated/prisma/client';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { CategoryService } from './categories.service';
import { CreateCategoryDto, createCategorySchema } from './dto/categories.dto';

@Controller('categories')
export class CategoryController {
  constructor(private readonly _categoryService: CategoryService) {}

  @Get()
  async getCategories(@GetUser() user: User) {
    return this._categoryService.findAll(user.id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createCategorySchema))
  async createCategory(
    @GetUser() user: User,
    @Body() dto: CreateCategoryDto,
  ) {
    return this._categoryService.create(user.id, dto);
  }

  @Delete(':id')
  async deleteCategory(@GetUser() user: User, @Param('id') id: string) {
    return this._categoryService.delete(user.id, id);
  }
}
