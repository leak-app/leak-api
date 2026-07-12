import { Module } from '@nestjs/common';
import { WalletController } from './wallets.controller';
import { WalletService } from './wallets.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletsModule {}
