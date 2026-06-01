import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { generateToken } from '../middleware/auth';

const prisma = new PrismaClient();

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        res.status(400).json({
          success: false,
          error: 'Email, password, and name are required',
        });
        return;
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        res.status(400).json({
          success: false,
          error: 'Email already registered',
        });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
          role: 'user',
        },
      });

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          token,
        },
        message: 'Registration successful',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: 'Email and password are required',
        });
        return;
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
        return;
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          token,
        },
        message: 'Login successful',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }
}

export const authController = new AuthController();
