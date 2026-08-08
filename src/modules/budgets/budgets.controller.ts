import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import type { User } from '@/generated/prisma/client';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { BudgetsService } from './budgets.service';
import {
  QueryBudgetDto,
  queryBudgetSchema,
  UpsertBudgetDto,
  upsertBudgetSchema,
} from './dto/budgets.dto';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly _budgetsService: BudgetsService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(queryBudgetSchema))
  async getBudgets(
    @GetUser() user: User, //
    @Query() query: QueryBudgetDto,
  ) {
    return this._budgetsService.findAll(user.id, query);
  }

  @Get('report')
  @UsePipes(new ZodValidationPipe(queryBudgetSchema))
  async getReport(
    @GetUser() user: User, //
    @Query() query: QueryBudgetDto,
  ) {
    return this._budgetsService.getReport(user.id, query);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(upsertBudgetSchema))
  async upsertBudget(
    @GetUser() user: User, //
    @Body() dto: UpsertBudgetDto,
  ) {
    return this._budgetsService.upsert(user.id, dto);
  }

  @Delete(':id')
  async deleteBudget(
    @GetUser() user: User, //
    @Param('id') id: string,
  ) {
    return this._budgetsService.delete(user.id, id);
  }
}
