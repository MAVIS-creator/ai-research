import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import db from '../db.js';
import config from '../config.js';

export function createUser({ email, password, role = 'admin' }) {
  const id = randomUUID();
  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  db.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    id,
    email.toLowerCase(),
    hash,
    role
  );
  return getUserById(id);
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

export function getUserById(id) {
  return db.prepare('SELECT id, email, role, created_at AS createdAt FROM users WHERE id = ?').get(id);
}

export function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/** Express middleware: requires a valid Bearer token; attaches req.user. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}
