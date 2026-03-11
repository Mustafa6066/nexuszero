import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  sha256Hash,
  generateApiKey,
  generateHmacSignature,
  verifyHmacSignature,
  generateWebhookSecret,
  hashPassword,
  verifyPassword,
  generateSecureToken,
} from '../src/utils/crypto';

describe('encrypt / decrypt', () => {
  const key = 'a'.repeat(64); // 32 bytes hex

  it('round-trips plaintext', () => {
    const plaintext = 'Hello, NexusZero!';
    const cipher = encrypt(plaintext, key);
    expect(decrypt(cipher, key)).toBe(plaintext);
  });

  it('produces different ciphertexts per call (random IV)', () => {
    const a = encrypt('same', key);
    const b = encrypt('same', key);
    expect(a).not.toBe(b);
  });

  it('throws on tampered ciphertext', () => {
    const cipher = encrypt('data', key);
    const parts = cipher.split(':');
    parts[2] = 'AAAA' + parts[2]!.slice(4);
    expect(() => decrypt(parts.join(':'), key)).toThrow();
  });

  it('throws on invalid format', () => {
    expect(() => decrypt('invalid', key)).toThrow('Invalid ciphertext format');
  });
});

describe('sha256Hash', () => {
  it('returns 64 hex chars', () => {
    const hash = sha256Hash('test');
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('is deterministic', () => {
    expect(sha256Hash('hello')).toBe(sha256Hash('hello'));
  });
});

describe('generateApiKey', () => {
  it('starts with prefix', () => {
    expect(generateApiKey('nz').startsWith('nz_')).toBe(true);
    expect(generateApiKey('test').startsWith('test_')).toBe(true);
  });

  it('is unique', () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});

describe('HMAC signatures', () => {
  it('generates and verifies signatures', () => {
    const payload = '{"event":"test"}';
    const secret = 'my-secret';
    const sig = generateHmacSignature(payload, secret);
    expect(verifyHmacSignature(payload, secret, sig)).toBe(true);
  });

  it('rejects wrong payload', () => {
    const secret = 'secret';
    const sig = generateHmacSignature('original', secret);
    expect(verifyHmacSignature('tampered', secret, sig)).toBe(false);
  });

  it('rejects wrong secret', () => {
    const sig = generateHmacSignature('data', 'secret1');
    expect(verifyHmacSignature('data', 'secret2', sig)).toBe(false);
  });
});

describe('generateWebhookSecret', () => {
  it('starts with whsec_', () => {
    expect(generateWebhookSecret().startsWith('whsec_')).toBe(true);
  });
});

describe('password hashing', () => {
  it('hashes and verifies password', () => {
    const hash = hashPassword('MySecure123!');
    expect(verifyPassword('MySecure123!', hash)).toBe(true);
  });

  it('rejects wrong password', () => {
    const hash = hashPassword('correct');
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces different hashes (random salt)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });
});

describe('generateSecureToken', () => {
  it('generates hex token of correct length', () => {
    const token = generateSecureToken(16);
    expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
  });
});
