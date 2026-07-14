import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Public } from '@/common/decorators/public.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { setCookie, clearCookie } from '@/utils/cookie.helper';

import { AuthService } from './auth.service';
import {
  GoogleSignInDto,
  googleSignInSchema,
  SignInDto,
  signInSchema,
  SignUpDto,
  signUpSchema,
} from './dto/auth.dto';
import { RequestTracing } from './models';

@Controller('auth')
export class AuthController {
  constructor(private readonly _authService: AuthService) {}

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
}
