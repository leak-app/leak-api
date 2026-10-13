import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Res,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { GetUser } from '@/auth/get-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import type { User } from '@/generated/prisma/client';
import {
  CallbackQueryDto,
  callbackQuerySchema,
  ToggleSheetsSyncDto,
  toggleSheetsSyncSchema,
} from './dto/google-sheets.dto';
import { GoogleSheetsService } from './google-sheets.service';

@Controller('sync/google-sheets')
export class GoogleSheetsController {
  constructor(private readonly _sheets: GoogleSheetsService) {}

  @Get()
  getStatus(@GetUser() user: User) {
    return this._sheets.getStatus(user.id);
  }

  @Post('connect')
  async connect(@GetUser() user: User) {
    return { url: await this._sheets.createConnectUrl(user.id) };
  }

  /**
   * Google redirects the browser here, so there is no bearer token: the signed `state`
   * identifies the user. The reply is a redirect, not a JSON envelope, which is why it
   * uses @Res() without passthrough (ResponseInterceptor never wraps it).
   */
  @Public()
  @Get('callback')
  @UsePipes(new ZodValidationPipe(callbackQuerySchema, 'query'))
  async callback(
    @Query() query: CallbackQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { redirectUrl, firstSyncUserId } =
      await this._sheets.handleCallback(query);
    res.redirect(redirectUrl);
    if (firstSyncUserId) {
      void this._sheets.runConnectSync(firstSyncUserId);
    }
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(toggleSheetsSyncSchema))
  toggle(@GetUser() user: User, @Body() dto: ToggleSheetsSyncDto) {
    return this._sheets.setEnabled(user.id, dto.enabled);
  }

  @Post('run')
  run(@GetUser() user: User) {
    return this._sheets.runNow(user.id);
  }

  @Delete()
  disconnect(@GetUser() user: User) {
    return this._sheets.disconnect(user.id);
  }
}
