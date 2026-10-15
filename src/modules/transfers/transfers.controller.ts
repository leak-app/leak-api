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
import {
  CreateTransferDto,
  createTransferSchema,
  ListTransfersQueryDto,
  listTransfersQuerySchema,
} from './dto/transfers.dto';
import { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly _transfers: TransfersService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createTransferSchema))
  async create(@GetUser() user: User, @Body() dto: CreateTransferDto) {
    return this._transfers.create(user.id, dto);
  }

  @Get()
  async list(
    @GetUser() user: User,
    @Query(new ZodValidationPipe(listTransfersQuerySchema, 'query'))
    query: ListTransfersQueryDto,
  ) {
    return this._transfers.findAll(user.id, query);
  }

  @Delete(':id')
  async remove(@GetUser() user: User, @Param('id') id: string) {
    return this._transfers.delete(user.id, id);
  }
}
