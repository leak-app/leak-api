import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import type { User } from '@/generated/prisma/client';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { WalletService } from './wallets.service';
import {
  CreateWalletDto,
  createWalletSchema,
  UpdateWalletDto,
  updateWalletSchema,
} from './dto/wallets.dto';

@Controller('wallets')
export class WalletController {
  constructor(private readonly _walletService: WalletService) {}

  @Get()
  async getWallets(@GetUser() user: User) {
    return this._walletService.findAll(user.id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createWalletSchema))
  async createWallet(@GetUser() user: User, @Body() dto: CreateWalletDto) {
    return this._walletService.create(user.id, dto);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateWalletSchema))
  async updateWallet(
    @GetUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateWalletDto,
  ) {
    return this._walletService.update(user.id, id, dto);
  }

  @Delete(':id')
  async deleteWallet(@GetUser() user: User, @Param('id') id: string) {
    return this._walletService.delete(user.id, id);
  }
}
