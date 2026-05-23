import express from 'express';
import bcrypt from 'bcrypt';

import { userDb } from '../modules/database/index.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get('/users', (req, res) => {
  try {
    const users = userDb.listUsers();
    res.json({ users });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain uppercase, lowercase, and a number' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = userDb.createUser(username, passwordHash, { isAdmin: false });

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Username already exists' });
    }

    return res.status(500).json({ error: 'Failed to create user' });
  }
});

router.delete('/users/:id', (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete the currently signed-in administrator' });
    }

    // Prevent deleting the last admin
    const targetUser = userDb.getUserById(targetUserId);
    if (targetUser?.isAdmin) {
      const allUsers = userDb.listUsers();
      const adminCount = allUsers.filter(u => u.isAdmin).length;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last administrator' });
      }
    }

    const deleted = userDb.deleteUser(targetUserId);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Admin delete user error:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Password reset by admin
router.put('/users/:id/password', async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain uppercase, lowercase, and a number' });
    }

    const user = userDb.getUserById(targetUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    userDb.updatePassword(targetUserId, passwordHash);

    return res.json({ success: true });
  } catch (error) {
    console.error('Admin reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
