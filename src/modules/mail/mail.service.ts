import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly _logger = new Logger(MailService.name);

  constructor(
    private readonly _mailerService: MailerService,
    private readonly _configService: ConfigService,
  ) {}

  async sendPasswordResetEmail(
    to: string,
    name: string | undefined,
    resetUrl: string,
  ): Promise<void> {
    const host = this._configService.get<string>('SMTP_HOST');
    const user = this._configService.get<string>('SMTP_USER');

    // Always log dev URL for convenience in development and debugging
    this._logger.log(`[AUTH] Password reset link for ${to}: ${resetUrl}`);

    if (!host || !user) {
      this._logger.warn(
        `SMTP not configured. Skipped sending email to ${to}. Used console log instead.`,
      );
      return;
    }

    try {
      await this._mailerService.sendMail({
        to,
        subject: 'Khôi phục mật khẩu tài khoản LEAK',
        template: 'reset-password',
        context: {
          name: name || to.split('@')[0],
          resetUrl,
          year: new Date().getFullYear(),
        },
      });
      this._logger.log(`Password reset email sent to ${to}`);
    } catch (error) {
      this._logger.error(`Failed to send password reset email to ${to}:`, error);
      // Non-blocking resilience: do not throw to crash auth flow
    }
  }
}
