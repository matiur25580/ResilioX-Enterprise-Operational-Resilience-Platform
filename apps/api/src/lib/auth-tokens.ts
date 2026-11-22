import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export interface AccessClaims {
  sub: string;
  sid: string;
  mid: string;
  org: string;
  role: string;
  iat: number;
  exp: number;
}

const encode = (value: object | string) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const signature = (input: string) => createHmac('sha256', env.AUTH_TOKEN_SECRET).update(input).digest('base64url');

export function issueAccessToken(claims: Omit<AccessClaims, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ ...claims, iat: now, exp: now + env.ACCESS_TOKEN_TTL_SECONDS });
  const input = header + '.' + payload;
  return input + '.' + signature(input);
}

export function verifyAccessToken(token: string): AccessClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [header, payload, providedSignature] = parts;
  if (!header || !payload || !providedSignature) throw new Error('Invalid token');
  const input = header + '.' + payload;
  const expected = Buffer.from(signature(input));
  const actual = Buffer.from(providedSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid signature');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessClaims;
  if (!claims.sub || !claims.sid || !claims.mid || !claims.org || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Expired or incomplete token');
  }
  return claims;
}

export function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
