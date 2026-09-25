import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import ms, { StringValue } from 'ms';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';

import { UserRepository } from '@/user/user.repository';
import { UserModel } from '@/generated/prisma/models';
import { CategoryService } from '../modules/categories/categories.service';
import { SessionRepository } from './session.repository';
import { PasswordResetRepository } from './password-reset.repository';
import { MailService } from '../modules/mail/mail.service';
import {
  GoogleSignInDto,
  type SignUpDto,
  type SignInDto,
} from './dto/auth.dto';
import { JwtPayload, RequestTracing } from './models';

@Injectable()
export class AuthService {
  private readonly _logger = new Logger(AuthService.name);

  constructor(
    private readonly _userRepository: UserRepository,
    private readonly _jwtService: JwtService,
    private readonly _sessionRepository: SessionRepository,
    private readonly _passwordResetRepository: PasswordResetRepository,
    private readonly _configService: ConfigService,
    private readonly _categoryService: CategoryService,
    private readonly _mailService: MailService,
  ) {}

  async signUp(dto: SignUpDto, tracing?: RequestTracing) {
    const existingUser = await this._userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('Email đã được sử dụng');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = await this._userRepository.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
    });

    await this._categoryService.seedDefaultCategories(newUser.id);

    return this._generateTokens(newUser, tracing);
  }

  async signIn(dto: SignInDto, tracing?: RequestTracing) {
    const user = await this._userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    return this._generateTokens(user, tracing);
  }

  async refresh(token: string, tracing?: RequestTracing) {
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const session = await this._sessionRepository.findByToken(hashedToken);

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      if (session) {
        await this._sessionRepository.revoke(hashedToken);
      }
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    const user = await this._userRepository.findById(session.userId);
    if (!user) {
      throw new UnauthorizedException('Người dùng không còn tồn tại');
    }

    await this._sessionRepository.revoke(hashedToken);
    return this._generateTokens(user, tracing);
  }

  async signOut(token: string) {
    const hashedToken = createHash('sha256').update(token).digest('hex');
    await this._sessionRepository.revoke(hashedToken);

    return true;
  }

  async googleSignIn(dto: GoogleSignInDto, tracing?: RequestTracing) {
    let email: string;
    let name: string | undefined;

    try {
      const response = await axios.get<{
        email: string;
        name?: string;
        email_verified?: string | boolean;
      }>(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${dto.credentialToken}`,
      );

      const payload = response.data;
      if (!payload.email) {
        throw new UnauthorizedException('Dữ liệu token Google không hợp lệ');
      }
      email = payload.email;
      name = payload.name ?? dto.name;
    } catch {
      throw new UnauthorizedException('Xác thực token Google thất bại');
    }

    let user = await this._userRepository.findByEmail(email);

    if (!user) {
      const randomPassword = uuidv4();
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      user = await this._userRepository.create({
        email,
        password: hashedPassword,
        name,
      });

      await this._categoryService.seedDefaultCategories(user.id);
    }

    return this._generateTokens(user, tracing);
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Private methods
  // -----------------------------------------------------------------------------------------------------

  private async _generateTokens(user: UserModel, tracing?: RequestTracing) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    const accessToken = await this._jwtService.signAsync({ ...payload });

    const refreshToken = uuidv4();
    const refreshTokenTtl = ms(
      this._configService.get<StringValue>('JWT_REFRESH_TTL', '30d'),
    );

    const hashedRefreshToken = createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    await this._sessionRepository.create({
      token: hashedRefreshToken,
      userId: user.id,
      expiresAt: dayjs().add(refreshTokenTtl, 'ms').toDate(),
      ipAddress: tracing?.ip,
      userAgent: tracing?.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenTtl,
    };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this._userRepository.findByEmail(email);
    if (!user) {
      // Prevent user enumeration
      return {
        message:
          'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
      };
    }

    await this._passwordResetRepository.invalidatePreviousTokens(user.id);

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this._passwordResetRepository.create({
      token,
      userId: user.id,
      expiresAt,
    });

    const frontendUrl = this._configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await this._mailService.sendPasswordResetEmail(
      user.email,
      user.name || undefined,
      resetUrl,
    );

    return {
      message:
        'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const resetToken = await this._passwordResetRepository.findByToken(token);

    if (
      !resetToken ||
      resetToken.usedAt !== null ||
      resetToken.expiresAt < new Date()
    ) {
      throw new BadRequestException(
        'Yêu cầu đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this._userRepository.update(resetToken.userId, {
      password: hashedPassword,
    });

    await this._passwordResetRepository.markAsUsed(resetToken.id);

    await this._sessionRepository.deleteMany({
      userId: resetToken.userId,
    });

    return {
      message:
        'Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới.',
    };
  }
}
