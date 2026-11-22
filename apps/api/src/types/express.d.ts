declare global {
  namespace Express {
    interface Locals { requestId?: string; }
    interface Request {
      auth?: { userId: string; sessionId: string; membershipId: string; organizationId: string; role: string };
    }
  }
}
export {};
