import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import type { User } from '@/generated/prisma/client';
import { ParseQuickLogDto, parseQuickLogSchema } from './dto/quick-log.dto';
import { QuickLogService } from './quick-log.service';

@Controller('transactions')
export class QuickLogController {
  constructor(private readonly _quickLog: QuickLogService) {}

  /** Returns a draft for the form. Never persists anything. */
  @Post('parse')
  @UsePipes(new ZodValidationPipe(parseQuickLogSchema))
  parse(@GetUser() user: User, @Body() dto: ParseQuickLogDto) {
    return this._quickLog.parse(user.id, dto);
  }
}
