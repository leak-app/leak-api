import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';

import { CommonModule } from '../common/common.module';
import { UserModule } from '../user/user.module';
import { CategoriesModule } from '../modules/categories/categories.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

import { SessionRepository } from './session.repository';
import { SessionCleanupService } from './session-cleanup.service';

@Module({
  imports: [
    CommonModule,
    UserModule,
    CategoriesModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<StringValue>('JWT_ACCESS_TTL', '60m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    SessionRepository,
    SessionCleanupService,
  ],
  exports: [AuthService, JwtModule, JwtStrategy, SessionRepository],
})
export class AuthModule {}
