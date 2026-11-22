import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import argon2 from 'argon2';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { createRefreshToken, hashRefreshToken, issueAccessToken } from '../lib/auth-tokens.js';
import { AppError } from '../middleware/error-handler.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'AUTH_RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } } });
const registerSchema = z.object({
  email: z.string().email().max(254).transform(v => v.trim().toLowerCase()),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(120),
  organizationName: z.string().trim().min(2).max(160),
  organizationSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
});
const loginSchema = z.object({ email: z.string().email().transform(v => v.trim().toLowerCase()), password: z.string().min(1).max(128), organizationSlug: z.string().trim().toLowerCase().min(2).max(80) });

function cookieValue(req: Parameters<typeof authRouter.post>[1] extends never ? never : any): string | undefined {
  const raw = req.headers.cookie as string | undefined;
  const item = raw?.split(';').map(v => v.trim()).find(v => v.startsWith(env.REFRESH_COOKIE_NAME + '='));
  return item ? decodeURIComponent(item.slice(env.REFRESH_COOKIE_NAME.length + 1)) : undefined;
}
function setRefreshCookie(res: any, token: string) {
  const maxAge = env.REFRESH_TOKEN_TTL_DAYS * 86400;
  res.setHeader('Set-Cookie', `${env.REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=${env.API_BASE_PATH}/auth; SameSite=Strict; Max-Age=${maxAge}${env.COOKIE_SECURE ? '; Secure' : ''}`);
}
function clearRefreshCookie(res: any) {
  res.setHeader('Set-Cookie', `${env.REFRESH_COOKIE_NAME}=; HttpOnly; Path=${env.API_BASE_PATH}/auth; SameSite=Strict; Max-Age=0${env.COOKIE_SECURE ? '; Secure' : ''}`);
}
async function createSession(userId: string, membership: { id: string; organizationId: string; role: string }, req: any, res: any, familyId = randomUUID()) {
  const refreshToken = createRefreshToken();
  const session = await prisma.refreshSession.create({ data: {
    userId, tokenHash: hashRefreshToken(refreshToken), familyId,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400_000),
    userAgent: String(req.get('user-agent') ?? '').slice(0, 512) || null,
    ipAddress: req.ip?.slice(0, 64) ?? null,
  } });
  setRefreshCookie(res, refreshToken);
  return { accessToken: issueAccessToken({ sub: userId, sid: session.id, mid: membership.id, org: membership.organizationId, role: membership.role }), expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
}

authRouter.post('/register', limiter, async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: { email: input.email, displayName: input.displayName, passwordHash } });
      const organization = await tx.organization.create({ data: { name: input.organizationName, slug: input.organizationSlug } });
      const membership = await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, status: 'ACTIVE', role: 'OWNER', joinedAt: new Date() } });
      await tx.auditEvent.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'identity.organization_registered', targetType: 'organization', targetId: organization.id, ipAddress: req.ip?.slice(0, 64) } });
      return { user, membership, organization };
    });
    const tokens = await createSession(result.user.id, result.membership, req, res);
    res.status(201).json({ data: { user: { id: result.user.id, email: result.user.email, displayName: result.user.displayName }, organization: { id: result.organization.id, name: result.organization.name, slug: result.organization.slug }, ...tokens } });
  } catch (error: any) {
    if (error?.code === 'P2002') return next(new AppError(409, 'ACCOUNT_ALREADY_EXISTS', 'The email or organization slug is already in use.'));
    next(error);
  }
});

authRouter.post('/login', limiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, input.password))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const membership = await prisma.membership.findFirst({ where: { userId: user.id, status: 'ACTIVE', organization: { slug: input.organizationSlug, status: 'ACTIVE' } }, select: { id: true, organizationId: true, role: true } });
    if (!membership) throw new AppError(403, 'ORGANIZATION_ACCESS_DENIED', 'No active membership exists for this organization.');
    const tokens = await createSession(user.id, membership, req, res);
    await prisma.auditEvent.create({ data: { organizationId: membership.organizationId, actorUserId: user.id, action: 'identity.login_succeeded', ipAddress: req.ip?.slice(0, 64) } });
    res.json({ data: { user: { id: user.id, email: user.email, displayName: user.displayName }, ...tokens } });
  } catch (error) { next(error); }
});

authRouter.post('/refresh', limiter, async (req, res, next) => {
  try {
    const token = cookieValue(req);
    if (!token) throw new AppError(401, 'REFRESH_TOKEN_REQUIRED', 'A refresh session is required.');
    const tokenHash = hashRefreshToken(token);
    const current = await prisma.refreshSession.findUnique({ where: { tokenHash } });
    if (!current) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'The refresh session is invalid.');
    if (current.revokedAt || current.expiresAt <= new Date()) {
      await prisma.refreshSession.updateMany({ where: { familyId: current.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      clearRefreshCookie(res);
      throw new AppError(401, 'REFRESH_TOKEN_REUSE', 'The refresh session is no longer valid. Please sign in again.');
    }
    const membership = await prisma.membership.findFirst({ where: { userId: current.userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } }, orderBy: { joinedAt: 'asc' }, select: { id: true, organizationId: true, role: true } });
    if (!membership) throw new AppError(403, 'ORGANIZATION_ACCESS_DENIED', 'No active organization membership exists.');
    const nextToken = createRefreshToken();
    const nextId = randomUUID();
    await prisma.$transaction(async tx => {
      const changed = await tx.refreshSession.updateMany({ where: { id: current.id, revokedAt: null }, data: { revokedAt: new Date(), replacedBy: nextId } });
      if (changed.count !== 1) throw new AppError(401, 'REFRESH_TOKEN_REUSE', 'The refresh session was already rotated.');
      await tx.refreshSession.create({ data: { id: nextId, userId: current.userId, tokenHash: hashRefreshToken(nextToken), familyId: current.familyId, expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400_000), userAgent: String(req.get('user-agent') ?? '').slice(0, 512) || null, ipAddress: req.ip?.slice(0, 64) ?? null } });
    });
    setRefreshCookie(res, nextToken);
    res.json({ data: { accessToken: issueAccessToken({ sub: current.userId, sid: nextId, mid: membership.id, org: membership.organizationId, role: membership.role }), expiresIn: env.ACCESS_TOKEN_TTL_SECONDS } });
  } catch (error) { next(error); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = cookieValue(req);
    if (token) await prisma.refreshSession.updateMany({ where: { tokenHash: hashRefreshToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (error) { next(error); }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { id: true, email: true, displayName: true, createdAt: true } });
    res.json({ data: { user, tenant: { id: req.auth!.organizationId, membershipId: req.auth!.membershipId, role: req.auth!.role } } });
  } catch (error) { next(error); }
});
