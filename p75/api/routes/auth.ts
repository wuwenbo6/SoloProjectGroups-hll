import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  getUserByUsername,
  getAllUsers,
  createUser as dbCreateUser,
  updateUserRole as dbUpdateUserRole,
  deleteUser as dbDeleteUser,
} from '../database/index.js';
import {
  authenticateToken,
  AuthRequest,
  generateToken,
  requireRole,
  ROLES,
} from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
      });
    }

    const user = getUserByUsername(username) as any;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    const validPassword = bcrypt.compareSync(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
    });
  }
});

router.get('/me', authenticateToken, (req: AuthRequest, res) => {
  res.json({
    success: true,
    data: req.user,
  });
});

router.get('/users', authenticateToken, requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const users = getAllUsers();
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users',
    });
  }
});

router.post('/users', authenticateToken, requireRole(ROLES.ADMIN), (req: AuthRequest, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and role are required',
      });
    }

    if (![ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role',
      });
    }

    const existingUser = getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists',
      });
    }

    const result = dbCreateUser(username, password, role);

    res.json({
      success: true,
      data: {
        id: (result as any).lastInsertRowid,
        username,
        role,
      },
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create user',
    });
  }
});

router.put('/users/:id/role', authenticateToken, requireRole(ROLES.ADMIN), (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;

    if (![ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role',
      });
    }

    dbUpdateUserRole(userId, role);

    res.json({
      success: true,
      message: 'User role updated',
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user role',
    });
  }
});

router.delete('/users/:id', authenticateToken, requireRole(ROLES.ADMIN), (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (userId === req.user?.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete yourself',
      });
    }

    dbDeleteUser(userId);

    res.json({
      success: true,
      message: 'User deleted',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
    });
  }
});

export default router;
