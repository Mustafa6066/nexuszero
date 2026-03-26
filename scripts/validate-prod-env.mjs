import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'NEXTAUTH_SECRET',
  'ENCRYPTION_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'CLICKHOUSE_URL',
  'CLICKHOUSE_USER',
  'CLICKHOUSE_PASSWORD',
  'KAFKA_BROKERS',
  'KAFKA_USERNAME',
  'KAFKA_PASSWORD',
  'R2_BUCKET_NAME',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ENDPOINT',
];

function validate() {
  console.log('🔍 Validating production environment variables...');
  
  const missing = [];
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(m => console.error(`   - ${m}`));
    process.exit(1);
  }

  console.log('✅ All required environment variables are set.');
  
  // Check encryption key length (must be 32 bytes for AES-256)
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (encryptionKey && encryptionKey.length !== 64) { // Hex encoded 32 bytes
    console.warn('⚠️ ENCRYPTION_KEY should be a 64-character hex string (32 bytes).');
  }

  // Check JWT secret strength
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && jwtSecret.length < 32) {
    console.warn('⚠️ JWT_SECRET is too short. Recommended at least 32 characters.');
  }
}

validate();
