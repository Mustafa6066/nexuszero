import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, timingSafeEqual, scryptSync } from 'node:crypto';

/**
 * AES-256-GCM encryption. Returns base64 string: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * AES-256-GCM decryption. Expects base64 string: iv:authTag:ciphertext
 */
export function decrypt(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(':');
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error('Invalid ciphertext format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

/** SHA-256 hash, returns hex string */
export function sha256Hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Generate a random API key with prefix */
export function generateApiKey(prefix = 'nz'): string {
  return `${prefix}_${randomBytes(32).toString('hex')}`;
}

/** Generate HMAC-SHA256 signature */
export function generateHmacSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Verify HMAC signature with timing-safe comparison */
export function verifyHmacSignature(payload: string, secret: string, signature: string): boolean {
  const expected = generateHmacSignature(payload, secret);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

/** Generate webhook signing secret */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

/** Hash password with scrypt + random salt */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Verify password against scrypt hash */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

/** Generate a secure random token (hex) */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
