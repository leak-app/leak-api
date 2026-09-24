import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import type { User } from '@/generated/prisma/client';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { OutcomesService } from './outcomes.service';
import { ReviewOutcomeDto, reviewOutcomeSchema } from './dto/outcomes.dto';

@Controller('outcomes')
export class OutcomesController {
  constructor(private readonly _outcomesService: OutcomesService) {}

  @Get('queue')
  async getQueue(@GetUser() user: User) {
    return this._outcomesService.getQueue(user.id);
  }

  @Patch(':transactionId')
  async review(
    @GetUser() user: User,
    @Param('transactionId') transactionId: string,
    @Body(new ZodValidationPipe(reviewOutcomeSchema)) dto: ReviewOutcomeDto,
  ) {
    return this._outcomesService.review(user.id, transactionId, dto);
  }
}
