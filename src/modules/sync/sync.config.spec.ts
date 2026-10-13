import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SyncConfig } from './sync.config';

const KEY = Buffer.alloc(32, 7).toString('base64');
const FULL_ENV: Record<string, string> = {
  GOOGLE_AUTH_CLIENT_ID: 'client-id',
  GOOGLE_AUTH_CLIENT_SECRET: 'client-secret-value',
  GOOGLE_SHEETS_REDIRECT_URI:
    'https://leak.example/api/sync/google-sheets/callback',
  SYNC_TOKEN_ENCRYPTION_KEY: KEY,
  JWT_SECRET: 'jwt-secret-value',
  FRONTEND_URL: 'https://leak.example/',
};

function createConfig(env: Record<string, string | undefined>) {
  return new SyncConfig({
    get: (key: string) => env[key],
  } as unknown as ConfigService);
}

describe('SyncConfig', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is available when every variable is set', () => {
    const config = createConfig(FULL_ENV);
    expect(config.isAvailable).toBe(true);
    expect(config.missingKeys()).toEqual([]);
    expect(config.encryptionKey).toHaveLength(32);
  });

  it('strips trailing slashes from the frontend URL', () => {
    expect(createConfig(FULL_ENV).frontendUrl).toBe('https://leak.example');
  });

  it.each(Object.keys(FULL_ENV))('is unavailable without %s', (key) => {
    const config = createConfig({ ...FULL_ENV, [key]: undefined });
    expect(config.isAvailable).toBe(false);
    expect(config.missingKeys()).toEqual([key]);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    const config = createConfig({
      ...FULL_ENV,
      SYNC_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64'),
    });
    expect(config.isAvailable).toBe(false);
    expect(config.missingKeys()).toEqual(['SYNC_TOKEN_ENCRYPTION_KEY']);
  });

  it('warns at boot with the variable names only, never their values', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    createConfig({
      ...FULL_ENV,
      GOOGLE_SHEETS_REDIRECT_URI: undefined,
    }).onModuleInit();

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('GOOGLE_SHEETS_REDIRECT_URI');
    expect(message).not.toContain('client-secret-value');
    expect(message).not.toContain('jwt-secret-value');
  });

  it('stays silent when everything is configured', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    createConfig(FULL_ENV).onModuleInit();
    expect(warn).not.toHaveBeenCalled();
  });
});
