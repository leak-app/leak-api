import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleSheetsController } from './google-sheets.controller';
import { GoogleSheetsService } from './google-sheets.service';
import { SheetsClientService } from './sheets-client.service';
import { SyncConfig } from './sync.config';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';
import { TokenCryptoService } from './token-crypto.service';

@Module({
  // No default secret: the connect `state` is always signed with an explicit derived secret.
  imports: [JwtModule.register({})],
  controllers: [GoogleSheetsController],
  providers: [
    SyncConfig,
    TokenCryptoService,
    GoogleOAuthService,
    SheetsClientService,
    SyncService,
    SyncScheduler,
    GoogleSheetsService,
  ],
})
export class SyncModule {}
