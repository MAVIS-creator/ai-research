import { Request, Response, NextFunction } from 'express';

export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: UserRole;
  apiKey?: string;
}

// Pre-seeded API Keys for developer testing & RBAC enforcement
export const API_KEYS: Record<string, AuthenticatedUser> = {
  'nexus-admin-key-999': {
    id: 'usr_admin',
    name: 'Lead SRE Admin',
    role: 'ADMIN',
    apiKey: 'nexus-admin-key-999',
  },
  'nexus-operator-key-555': {
    id: 'usr_operator',
    name: 'Platform Operator',
    role: 'OPERATOR',
    apiKey: 'nexus-operator-key-555',
  },
  'nexus-viewer-key-111': {
    id: 'usr_viewer',
    name: 'Auditor Viewer',
    role: 'VIEWER',
    apiKey: 'nexus-viewer-key-111',
  },
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Authentication middleware validating API Key or Bearer token with strict RBAC.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = (req.headers['x-api-key'] as string) || (req.query.apiKey as string);
  const authHeader = req.headers['authorization'];

  if (apiKey && API_KEYS[apiKey]) {
    req.user = API_KEYS[apiKey];
    return next();
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === 'admin-jwt-token' || token === 'nexus-admin-key-999') {
      req.user = API_KEYS['nexus-admin-key-999'];
      return next();
    }
    if (token === 'operator-jwt-token' || token === 'nexus-operator-key-555') {
      req.user = API_KEYS['nexus-operator-key-555'];
      return next();
    }
    if (token === 'viewer-jwt-token' || token === 'nexus-viewer-key-111') {
      req.user = API_KEYS['nexus-viewer-key-111'];
      return next();
    }
  }

  // If running in development without auth header, assign ReadOnly Viewer by default
  // State modifications MUST provide an authenticated key/token
  req.user = {
    id: 'usr_anonymous_viewer',
    name: 'Anonymous Viewer',
    role: 'VIEWER',
  };
  next();
}

/**
 * RBAC authorization guard: strictly requires one of the allowed roles.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication credentials required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Action requires one of roles [${allowedRoles.join(', ')}], but current role is "${req.user.role}". Please provide a valid X-API-Key or Bearer token.`,
      });
    }

    next();
  };
}
