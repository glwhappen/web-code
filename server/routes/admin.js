import express from 'express';
import bcrypt from 'bcrypt';

import { userDb, appConfigDb, getConnection } from '../modules/database/index.js';
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

// ===============================
// Sidebar UI Config
// ===============================

const DEFAULT_SIDEBAR_UI_CONFIG = {
  reportIssue: { show: true, url: 'https://github.com/siteboon/claudecodeui/issues/new' },
  joinCommunity: { show: true, url: 'https://discord.gg/buxwujPNRE' },
  githubRepo: { show: true, url: 'https://github.com/siteboon/claudecodeui' },
  githubStarBadge: { show: true, url: 'https://github.com/siteboon/claudecodeui' },
  showUpdateNotification: true,
};

router.get('/ui-config', (req, res) => {
  try {
    const raw = appConfigDb.get('sidebar_ui_config');
    const config = raw ? { ...DEFAULT_SIDEBAR_UI_CONFIG, ...JSON.parse(raw) } : DEFAULT_SIDEBAR_UI_CONFIG;
    return res.json({ success: true, data: config });
  } catch (error) {
    console.error('Admin get ui-config error:', error);
    return res.status(500).json({ error: 'Failed to load UI config' });
  }
});

router.put('/ui-config', (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid config payload' });
    }
    // Merge with defaults so unknown keys are preserved
    const merged = { ...DEFAULT_SIDEBAR_UI_CONFIG, ...body };
    appConfigDb.set('sidebar_ui_config', JSON.stringify(merged));
    return res.json({ success: true });
  } catch (error) {
    console.error('Admin put ui-config error:', error);
    return res.status(500).json({ error: 'Failed to save UI config' });
  }
});

// Usage logs — query queued_messages joined with users
router.get('/usage-logs', (req, res) => {
  try {
    const db = getConnection();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    const rawUserId = req.query.userId;
    if (rawUserId) {
      const uid = parseInt(rawUserId);
      if (Number.isInteger(uid) && uid > 0) {
        conditions.push('qm.user_id = ?');
        params.push(uid);
      }
    }

    const rawProvider = req.query.provider;
    if (typeof rawProvider === 'string' && rawProvider.trim()) {
      conditions.push('qm.provider = ?');
      params.push(rawProvider.trim());
    }

    const rawFrom = req.query.from;
    if (typeof rawFrom === 'string' && rawFrom.trim()) {
      conditions.push("qm.created_at >= ?");
      params.push(rawFrom.trim());
    }

    const rawTo = req.query.to;
    if (typeof rawTo === 'string' && rawTo.trim()) {
      conditions.push("qm.created_at <= ?");
      params.push(rawTo.trim() + ' 23:59:59');
    }

    const whereSQL = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { count: total } = db.prepare(
      `SELECT COUNT(*) as count FROM queued_messages qm ${whereSQL}`
    ).get(...params);

    const logs = db.prepare(`
      SELECT qm.id, qm.user_id, u.username, qm.session_id,
             qm.provider, qm.model, qm.permission_mode, qm.created_at
      FROM queued_messages qm
      JOIN users u ON qm.user_id = u.id
      ${whereSQL}
      ORDER BY qm.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const byProvider = db.prepare(`
      SELECT qm.provider, COUNT(*) as count
      FROM queued_messages qm ${whereSQL}
      GROUP BY qm.provider
      ORDER BY count DESC
    `).all(...params);

    const byUser = db.prepare(`
      SELECT u.id as userId, u.username, COUNT(*) as count
      FROM queued_messages qm
      JOIN users u ON qm.user_id = u.id
      ${whereSQL}
      GROUP BY qm.user_id
      ORDER BY count DESC
    `).all(...params);

    return res.json({ success: true, data: { logs, total, page, limit, byProvider, byUser } });
  } catch (error) {
    console.error('Admin usage-logs error:', error);
    return res.status(500).json({ error: 'Failed to load usage logs' });
  }
});

export default router;
