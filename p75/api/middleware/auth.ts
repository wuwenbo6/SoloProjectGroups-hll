import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'opc-ua-monitor-secret-key';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication token required',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    next();
  };
}

export function generateToken(user: { id: number; username: string; role: string }) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
};

export const PERMISSIONS = {
  VIEW_DASHBOARD: [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  MANAGE_RECIPES: [ROLES.ADMIN, ROLES.OPERATOR],
  MANAGE_PROGRAMS: [ROLES.ADMIN, ROLES.OPERATOR],
  MANAGE_USERS: [ROLES.ADMIN],
  ACKNOWLEDGE_ALARMS: [ROLES.ADMIN, ROLES.OPERATOR],
  EXPORT_DATA: [ROLES.ADMIN, ROLES.OPERATOR],
};
