import { Controller, Get, Param } from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import type { User } from '@/generated/prisma/client';
import { AiCommentaryService } from './ai-commentary.service';
import { transactionIdParamSchema } from './dto/ai-commentary.dto';

@Controller('ai-commentary')
export class AiCommentaryController {
  constructor(private readonly _commentary: AiCommentaryService) {}

  /** Polled by the app for a few seconds after a save; cheap and scoped to the caller. */
  @Get('transactions/:transactionId')
  findForTransaction(
    @GetUser() user: User,
    @Param(
      'transactionId',
      new ZodValidationPipe(transactionIdParamSchema, 'param'),
    )
    transactionId: string,
  ) {
    return this._commentary.findForTransaction(user.id, transactionId);
  }
}
