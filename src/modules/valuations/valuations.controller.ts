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
  CreateValuationDto,
  createValuationSchema,
  PortfolioQueryDto,
  portfolioQuerySchema,
} from './dto/valuations.dto';
import { ValuationsService } from './valuations.service';

@Controller()
export class ValuationsController {
  constructor(private readonly _valuations: ValuationsService) {}

  @Get('investments/summary')
  async portfolio(
    @GetUser() user: User,
    @Query(new ZodValidationPipe(portfolioQuerySchema, 'query'))
    query: PortfolioQueryDto,
  ) {
    return this._valuations.portfolio(user.id, query.months);
  }

  @Post('wallets/:id/valuations')
  @UsePipes(new ZodValidationPipe(createValuationSchema))
  async create(
    @GetUser() user: User,
    @Param('id') id: string,
    @Body() dto: CreateValuationDto,
  ) {
    return this._valuations.create(user.id, id, dto);
  }

  @Get('wallets/:id/valuations')
  async list(@GetUser() user: User, @Param('id') id: string) {
    return this._valuations.list(user.id, id);
  }

  @Delete('valuations/:id')
  async remove(@GetUser() user: User, @Param('id') id: string) {
    return this._valuations.delete(user.id, id);
  }
}
