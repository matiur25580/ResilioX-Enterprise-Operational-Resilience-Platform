import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/auth-tokens.js';
import { AppError } from './error-handler.js';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string; membershipId: string; organizationId: string; role: string };
    }
  }
}

// Verify the access token and re-check its session, membership, and organization against current database state.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'A valid access token is required.');
    const claims = verifyAccessToken(header.slice(7));
    const [session, membership, organization] = await Promise.all([
      prisma.refreshSession.findFirst({ where: { id: claims.sid, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } }),
      prisma.membership.findFirst({ where: { id: claims.mid, userId: claims.sub, organizationId: claims.org, status: 'ACTIVE' }, select: { id: true, role: true } }),
      prisma.organization.findFirst({ where: { id: claims.org, status: 'ACTIVE' }, select: { id: true } }),
    ]);
    if (!session || !membership || !organization || membership.role !== claims.role) {
      throw new AppError(401, 'SESSION_INVALID', 'The session is no longer active.');
    }
    req.auth = { userId: claims.sub, sessionId: claims.sid, membershipId: claims.mid, organizationId: claims.org, role: membership.role };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, 'INVALID_ACCESS_TOKEN', 'The access token is invalid or expired.'));
  }
}

const permissions: Record<string, string[]> = {
  OWNER: ['*'],
  ADMIN: ['members:read', 'members:write', 'services:read', 'services:write', 'continuity:read', 'continuity:write', 'audit:read'],
  RESILIENCE_MANAGER: ['services:read', 'services:write', 'continuity:read', 'continuity:write', 'audit:read'],
  ANALYST: ['services:read', 'continuity:read', 'audit:read'],
  VIEWER: ['services:read', 'continuity:read'],
};

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
    const granted = permissions[req.auth.role] ?? [];
    if (!granted.includes('*') && !granted.includes(permission)) {
      return next(new AppError(403, 'PERMISSION_DENIED', 'You do not have permission to perform this action.'));
    }
    next();
  };
}
