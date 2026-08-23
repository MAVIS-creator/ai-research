import { describe, it, expect, beforeAll } from 'vitest';

let monitorCreateSchema;
let registerSchema;

beforeAll(async () => {
  ({ monitorCreateSchema, registerSchema } = await import('../src/validation.js'));
});

// Pure-logic tests that don't need the app or DB.
describe('validation schemas', () => {

  it('applies defaults for monitor creation', () => {
    const parsed = monitorCreateSchema.parse({ name: 'A', url: 'https://x.dev/' });
    expect(parsed.method).toBe('GET');
    expect(parsed.expectedStatus).toBe(200);
    expect(parsed.intervalSeconds).toBe(60);
    expect(parsed.enabled).toBe(true);
  });

  it('normalizes emails to lowercase', () => {
    const parsed = registerSchema.parse({ email: '  USER@Example.COM ', password: 'longenough1' });
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects short passwords and bad intervals', () => {
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
    expect(
      monitorCreateSchema.safeParse({ name: 'A', url: 'https://x.dev/', intervalSeconds: 3 }).success
    ).toBe(false);
  });
});
