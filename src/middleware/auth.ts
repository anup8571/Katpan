import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../utils/security.ts';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
  userId?: number;
  authProvider?: 'email' | 'google';
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  // 1. Check custom HMAC-signed session token (Email/Password auth)
  const localSession = verifySessionToken(token);
  if (localSession) {
    req.user = {
      uid: localSession.uid,
      email: localSession.email,
      userId: localSession.userId,
      authProvider: 'email',
    };
    return next();
  }

  // 2. Fallback to Firebase ID token (Google Auth)
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      authProvider: 'google',
    };
    return next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};
