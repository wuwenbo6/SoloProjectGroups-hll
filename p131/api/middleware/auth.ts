import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : null;

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication token required',
    });
    return;
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret'
    ) as JwtPayload;
    
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Admin privileges required',
    });
    return;
  }

  next();
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '7d' }
  );
}
