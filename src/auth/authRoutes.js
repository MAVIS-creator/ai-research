import { Router } from 'express';
import {
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  signToken,
} from './authService.js';
import { validateBody, registerSchema, loginSchema } from '../validation.js';
import { createRateLimiter } from '../rateLimit.js';

const router = Router();

// Brute-force protection: 10 auth attempts per IP per minute.
const authLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

router.post('/register', authLimiter, validateBody(registerSchema), (req, res) => {
  const { email, password } = req.body;
  if (getUserByEmail(email)) {
    return res.status(409).json({ error: 'conflict', message: 'Email already registered' });
  }
  const user = createUser({ email, password });
  req.log?.info('user_registered', { userId: user.id });
  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', authLimiter, validateBody(loginSchema), (req, res) => {
  const { email, password } = req.body;
  const user = getUserByEmail(email);
  // Constant-ish response regardless of which factor failed (avoids user enumeration).
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' });
  }
  res.json({ token: signToken(user), user: getUserById(user.id) });
});

export default router;
