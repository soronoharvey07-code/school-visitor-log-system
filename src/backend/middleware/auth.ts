import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) || 'rhmc-production-secure-jwt-key-2026-auth-token';

export interface AuthRequest extends Request {
  user?: { id: number; username: string; role: string };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string; role: string };
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const userRole = req.user?.role?.toLowerCase();
  if (!req.user || (userRole !== 'admin' && userRole !== 'administrator')) {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }
  next();
};
