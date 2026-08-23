import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../db.js';
import config from '../config.js';
import {
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  signToken,
} from './authService.js';
import { validateBody, registerSchema, loginSchema } from '../validation.js';

const router = Router();

router.post('/register', validateBody(registerSchema), (req, res) => {
  const { email, password } = req.body;
  if (getUserByEmail(email)) {
    return res.status(409).json({ error: 'conflict', message: 'Email already registered' });
  }
  const user = createUser({ email, password });
  req.log?.info('user_registered', { userId: user.id });
  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', validateBody(loginSchema), (req, res) => {
  const { email, password } = req.body;
  const user = getUserByEmail(email);
  // Constant-ish response regardless of which factor failed (avoids user enumeration).
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' });
  }
  res.json({ token: signToken(user), user: getUserById(user.id) });
});

export default router;
