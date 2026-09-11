import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('SMTP_HOST');
        const user = config.get<string>('SMTP_USER');
        const pass = config.get<string>('SMTP_PASS');
        const port = Number(config.get<number>('SMTP_PORT', 587));
        const secure = config.get<string>('SMTP_SECURE') === 'true';
        const from = config.get<string>(
          'MAIL_FROM',
          'LEAK App <no-reply@leak.vn>',
        );

        return {
          transport:
            host && user
              ? {
                  host,
                  port,
                  secure,
                  auth: { user, pass },
                }
              : { jsonTransport: true },
          defaults: {
            from,
          },
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
