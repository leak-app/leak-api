import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Public } from '@/common/decorators/public.decorator';
import type { User } from '@/generated/prisma/client';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { setCookie, clearCookie } from '@/utils/cookie.helper';

import { AuthService } from './auth.service';
import { sessionIdParamSchema } from './dto/session.dto';
import { GetUser } from './get-user.decorator';
import { SessionService } from './session.service';
import {
  ForgotPasswordDto,
  forgotPasswordSchema,
  GoogleSignInDto,
  googleSignInSchema,
  ResetPasswordDto,
  resetPasswordSchema,
  SignInDto,
  signInSchema,
  SignUpDto,
  signUpSchema,
} from './dto/auth.dto';
import { RequestTracing } from './models';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly _authService: AuthService,
    private readonly _sessionService: SessionService,
  ) {}

  @Public()
  @Post('sign-up')
  @UsePipes(new ZodValidationPipe(signUpSchema))
  async signUp(
    @Body() signUpDto: SignUpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tracingData: RequestTracing = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const { accessToken, refreshToken, refreshTokenTtl } =
      await this._authService.signUp(signUpDto, tracingData);

    setCookie(res, { refreshToken }, refreshTokenTtl);

    return { accessToken };
  }

  @Public()
  @Post('sign-in')
  @UsePipes(new ZodValidationPipe(signInSchema))
  async signIn(
    @Body() signInDto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tracingData: RequestTracing = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const { accessToken, refreshToken, refreshTokenTtl } =
      await this._authService.signIn(signInDto, tracingData);

    setCookie(res, { refreshToken }, refreshTokenTtl);

    return { accessToken };
  }

  @Public()
  @Post('google-sign-in')
  @UsePipes(new ZodValidationPipe(googleSignInSchema))
  async googleSignIn(
    @Body() googleSignInDto: GoogleSignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tracingData: RequestTracing = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const { accessToken, refreshToken, refreshTokenTtl } =
      await this._authService.googleSignIn(googleSignInDto, tracingData);

    setCookie(res, { refreshToken }, refreshTokenTtl);

    return { accessToken };
  }

  @Public()
  @Post('refresh-token')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies['refreshToken'] as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Thiếu refresh token');
    }

    const tracingData: RequestTracing = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const {
      accessToken,
      refreshToken: newRefreshToken,
      refreshTokenTtl,
    } = await this._authService.refresh(refreshToken, tracingData);

    setCookie(res, { refreshToken: newRefreshToken }, refreshTokenTtl);

    return { accessToken };
  }

  @Post('sign-out')
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies['refreshToken'] as string | undefined;
    if (refreshToken) {
      await this._authService.signOut(refreshToken);
    }

    clearCookie(res, 'refreshToken');

    return true;
  }

  @Public()
  @Post('forgot-password')
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this._authService.forgotPassword(forgotPasswordDto.email);
  }

  @Public()
  @Post('reset-password')
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this._authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password,
    );
  }

  @Get('sessions')
  async listSessions(@GetUser() user: User, @Req() req: Request) {
    return this._sessionService.list(
      user.id,
      req.cookies['refreshToken'] as string | undefined,
    );
  }

  // Declared before 'sessions/:id' so "revoke-others" is never read as an id.
  @Post('sessions/revoke-others')
  async revokeOtherSessions(@GetUser() user: User, @Req() req: Request) {
    return this._sessionService.revokeOthers(
      user.id,
      req.cookies['refreshToken'] as string | undefined,
    );
  }

  @Delete('sessions/:id')
  async revokeSession(
    @GetUser() user: User,
    @Param('id', new ZodValidationPipe(sessionIdParamSchema, 'param'))
    id: number,
    @Req() req: Request,
  ) {
    return this._sessionService.revoke(
      user.id,
      id,
      req.cookies['refreshToken'] as string | undefined,
    );
  }
}
