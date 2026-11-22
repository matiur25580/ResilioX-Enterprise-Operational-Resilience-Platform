import { describe, expect, it } from 'vitest';
import { createRefreshToken, hashRefreshToken, issueAccessToken, verifyAccessToken } from '../src/lib/auth-tokens.js';

describe('authentication token primitives', () => {
  it('issues and verifies signed short-lived access claims', () => {
    const token = issueAccessToken({ sub: 'user-1', sid: 'session-1', mid: 'membership-1', org: 'tenant-1', role: 'OWNER' });
    expect(verifyAccessToken(token).sub).toBe('user-1');
  });
  it('rejects modified access tokens', () => {
    const token = issueAccessToken({ sub: 'user-1', sid: 'session-1', mid: 'membership-1', org: 'tenant-1', role: 'OWNER' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });
  it('creates high-entropy opaque refresh tokens and one-way hashes', () => {
    const first = createRefreshToken();
    const second = createRefreshToken();
    expect(first).not.toBe(second);
    expect(hashRefreshToken(first)).toHaveLength(64);
    expect(hashRefreshToken(first)).not.toBe(first);
  });
});
