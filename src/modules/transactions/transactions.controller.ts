import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import type { User } from '@/generated/prisma/client';
import { SpendOutcome, TransactionType } from '@/generated/prisma/client';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { TransactionService } from './transactions.service';
import {
  CreateTransactionDto,
  createTransactionSchema,
  outcomeFilterSchema,
  UpdateTransactionDto,
  updateTransactionSchema,
} from './dto/transactions.dto';

@Controller('transactions')
export class TransactionController {
  constructor(private readonly _transactionService: TransactionService) {}

  @Get()
  async getTransactions(
    @GetUser() user: User,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: TransactionType,
    @Query('categoryId') categoryId?: string,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
    @Query('outcome', new ZodValidationPipe(outcomeFilterSchema, 'query'))
    outcome?: SpendOutcome,
  ) {
    return this._transactionService.findAll(user.id, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      type,
      categoryId,
      accountId,
      outcome,
      startDate,
      endDate,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
    });
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createTransactionSchema))
  async createTransaction(
    @GetUser() user: User,
    @Body() dto: CreateTransactionDto,
  ) {
    return this._transactionService.create(user.id, dto);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateTransactionSchema))
  async updateTransaction(
    @GetUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this._transactionService.update(user.id, id, dto);
  }

  @Delete(':id')
  async deleteTransaction(@GetUser() user: User, @Param('id') id: string) {
    return this._transactionService.delete(user.id, id);
  }
}
