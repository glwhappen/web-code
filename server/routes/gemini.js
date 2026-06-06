import express from 'express';

import sessionManager from '../sessionManager.js';
import { sessionsDb } from '../modules/database/index.js';

const router = express.Router();

router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId || typeof sessionId !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(sessionId)) {
            return res.status(400).json({ success: false, error: 'Invalid session ID format' });
        }

        const userId = req.user?.id;
        if (userId === undefined || userId === null) {
            return res.status(401).json({ success: false, error: 'Authenticated user is required' });
        }

        await sessionManager.deleteSession(userId, sessionId);
        sessionsDb.deleteSessionById(userId, sessionId);
        res.json({ success: true });
    } catch (error) {
        console.error(`Error deleting Gemini session ${req.params.sessionId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
