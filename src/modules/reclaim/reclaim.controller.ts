import { Body, Controller, Get, Post, Query, UsePipes } from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import type { User } from '@/generated/prisma/client';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import {
  ReclaimHistoryQueryDto,
  reclaimHistoryQuerySchema,
  TransferReclaimDto,
  transferReclaimSchema,
} from './dto/reclaim.dto';
import { ReclaimService } from './reclaim.service';

@Controller('reclaim')
export class ReclaimController {
  constructor(private readonly _reclaimService: ReclaimService) {}

  @Get('offer')
  async getOffer(@GetUser() user: User) {
    return this._reclaimService.getOffer(user.id);
  }

  @Post('offer/transfer')
  @UsePipes(new ZodValidationPipe(transferReclaimSchema))
  async transfer(@GetUser() user: User, @Body() dto: TransferReclaimDto) {
    return this._reclaimService.transfer(user.id, dto);
  }

  @Post('offer/dismiss')
  async dismiss(@GetUser() user: User) {
    return this._reclaimService.dismiss(user.id);
  }

  @Get('history')
  async history(
    @GetUser() user: User,
    @Query(new ZodValidationPipe(reclaimHistoryQuerySchema, 'query'))
    query: ReclaimHistoryQueryDto,
  ) {
    return this._reclaimService.getHistory(user.id, query.months);
  }
}
