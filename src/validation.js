import { z } from 'zod';

/** Wraps a zod schema into Express middleware that validates req.body. */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'validation_error',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

const urlSchema = z
  .string()
  .trim()
  .url()
  .refine((u) => {
    try {
      return ['http:', 'https:'].includes(new URL(u).protocol);
    } catch {
      return false;
    }
  }, {
    message: 'URL must use http or https',
  });

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const monitorCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: urlSchema,
  method: z.enum(['GET', 'HEAD']).default('GET'),
  expectedStatus: z.number().int().min(100).max(599).default(200),
  intervalSeconds: z.number().int().min(10).max(3600).default(60),
  timeoutMs: z.number().int().min(500).max(30000).default(8000),
  failureThreshold: z.number().int().min(1).max(10).default(2),
  recoveryThreshold: z.number().int().min(1).max(10).default(2),
  enabled: z.boolean().default(true),
});

export const monitorUpdateSchema = monitorCreateSchema.partial();
