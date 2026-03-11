import { describe, it, expect } from 'vitest';
import { createTenantSchema, loginSchema, updateTenantSchema, paginationSchema, tenantBrandingSchema } from '../src/schemas/tenant.schema';

describe('createTenantSchema', () => {
  const validInput = {
    name: 'Acme Corp',
    slug: 'acme-corp',
    plan: 'growth' as const,
    ownerEmail: 'owner@acme.com',
    ownerName: 'John Doe',
    ownerPassword: 'securePass123',
  };

  it('accepts valid tenant creation input', () => {
    const result = createTenantSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = createTenantSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects slug with spaces', () => {
    const result = createTenantSchema.safeParse({ ...validInput, slug: 'acme corp' });
    expect(result.success).toBe(false);
  });

  it('rejects slug with uppercase', () => {
    const result = createTenantSchema.safeParse({ ...validInput, slug: 'Acme-Corp' });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = createTenantSchema.safeParse({ ...validInput, ownerPassword: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = createTenantSchema.safeParse({ ...validInput, ownerEmail: 'not-email' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid plan', () => {
    const result = createTenantSchema.safeParse({ ...validInput, plan: 'free' });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: 'test123' });
    expect(result.success).toBe(true);
  });

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'invalid', password: 'test' });
    expect(result.success).toBe(false);
  });
});

describe('updateTenantSchema', () => {
  it('accepts partial update', () => {
    const result = updateTenantSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no changes)', () => {
    const result = updateTenantSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects name too short', () => {
    const result = updateTenantSchema.safeParse({ name: 'A' });
    expect(result.success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('provides defaults', () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('coerces string values', () => {
    const result = paginationSchema.parse({ page: '3', limit: '50' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it('rejects limit > 100', () => {
    const result = paginationSchema.safeParse({ limit: 500 });
    expect(result.success).toBe(false);
  });
});

describe('tenantBrandingSchema', () => {
  it('accepts valid hex color', () => {
    const result = tenantBrandingSchema.safeParse({
      primaryColor: '#FF5500',
      logoUrl: null,
      companyName: 'Acme',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid hex color', () => {
    const result = tenantBrandingSchema.safeParse({
      primaryColor: 'red',
      logoUrl: null,
      companyName: 'Test',
    });
    expect(result.success).toBe(false);
  });
});
