import type { SyncConfig } from './sync.config';
import {
  TokenCryptoService,
  TokenDecryptionError,
} from './token-crypto.service';

function createService(keyByte = 1) {
  return new TokenCryptoService({
    encryptionKey: Buffer.alloc(32, keyByte),
  } as unknown as SyncConfig);
}

describe('TokenCryptoService', () => {
  it('round-trips a token', () => {
    const service = createService();
    const encrypted = service.encrypt('1//refresh-token-value');
    expect(service.decrypt(encrypted)).toBe('1//refresh-token-value');
  });

  it('uses the v1:<iv>:<tag>:<ciphertext> format and never contains the plaintext', () => {
    const encrypted = createService().encrypt('1//refresh-token-value');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    expect(Buffer.from(parts[1], 'base64')).toHaveLength(12);
    expect(encrypted).not.toContain('refresh-token-value');
  });

  it('uses a fresh IV every time', () => {
    const service = createService();
    expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
  });

  it('rejects a tampered ciphertext', () => {
    const service = createService();
    const [version, iv, tag, ciphertext] = service.encrypt('secret').split(':');
    const flipped = Buffer.from(ciphertext, 'base64');
    flipped[0] ^= 0xff;
    expect(() =>
      service.decrypt([version, iv, tag, flipped.toString('base64')].join(':')),
    ).toThrow(TokenDecryptionError);
  });

  it('rejects a payload encrypted with another key', () => {
    const encrypted = createService(1).encrypt('secret');
    expect(() => createService(2).decrypt(encrypted)).toThrow(
      TokenDecryptionError,
    );
  });

  it.each(['', 'not-a-payload', 'v2:a:b:c', 'v1:only:three'])(
    'rejects the malformed payload %j',
    (payload) => {
      expect(() => createService().decrypt(payload)).toThrow(
        TokenDecryptionError,
      );
    },
  );
});
