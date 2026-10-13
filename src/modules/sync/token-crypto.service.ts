import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SyncConfig } from './sync.config';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const FORMAT_VERSION = 'v1';

export class TokenDecryptionError extends Error {
  constructor() {
    super('Refresh token could not be decrypted');
    this.name = 'TokenDecryptionError';
  }
}

/** Encrypts refresh tokens at rest as `v1:<iv>:<tag>:<ciphertext>` (base64 parts). */
@Injectable()
export class TokenCryptoService {
  constructor(private readonly _config: SyncConfig) {}

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this._config.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    return [
      FORMAT_VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    try {
      const [version, iv, tag, ciphertext] = payload.split(':');
      if (version !== FORMAT_VERSION || !iv || !tag || !ciphertext) {
        throw new Error('Unsupported format');
      }
      const decipher = createDecipheriv(
        ALGORITHM,
        this._config.encryptionKey,
        Buffer.from(iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new TokenDecryptionError();
    }
  }
}
