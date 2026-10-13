import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const REQUIRED_KEYS = [
  'GOOGLE_AUTH_CLIENT_ID',
  'GOOGLE_AUTH_CLIENT_SECRET',
  'GOOGLE_SHEETS_REDIRECT_URI',
  'SYNC_TOKEN_ENCRYPTION_KEY',
  'JWT_SECRET',
  'FRONTEND_URL',
] as const;

/**
 * Reads the Google Sheets sync settings. Missing or invalid settings disable the feature
 * (see isAvailable) and must never stop the API from booting.
 */
@Injectable()
export class SyncConfig implements OnModuleInit {
  private readonly _logger = new Logger(SyncConfig.name);

  constructor(private readonly _config: ConfigService) {}

  onModuleInit(): void {
    const missing = this.missingKeys();
    if (missing.length > 0) {
      this._logger.warn(
        `Google Sheets sync is disabled. Missing or invalid environment variables: ${missing.join(', ')}`,
      );
    }
  }

  get clientId(): string {
    return this._read('GOOGLE_AUTH_CLIENT_ID');
  }

  get clientSecret(): string {
    return this._read('GOOGLE_AUTH_CLIENT_SECRET');
  }

  get redirectUri(): string {
    return this._read('GOOGLE_SHEETS_REDIRECT_URI');
  }

  get jwtSecret(): string {
    return this._read('JWT_SECRET');
  }

  get frontendUrl(): string {
    return this._read('FRONTEND_URL').replace(/\/+$/, '');
  }

  get encryptionKey(): Buffer {
    return Buffer.from(this._read('SYNC_TOKEN_ENCRYPTION_KEY'), 'base64');
  }

  missingKeys(): string[] {
    const missing: string[] = REQUIRED_KEYS.filter((key) => !this._read(key));
    if (
      !missing.includes('SYNC_TOKEN_ENCRYPTION_KEY') &&
      this.encryptionKey.length !== 32
    ) {
      missing.push('SYNC_TOKEN_ENCRYPTION_KEY');
    }
    return missing;
  }

  get isAvailable(): boolean {
    return this.missingKeys().length === 0;
  }

  private _read(key: string): string {
    return this._config.get<string>(key)?.trim() ?? '';
  }
}
