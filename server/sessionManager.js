import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Map keys are namespaced by user id so the same session id can belong to
// different users without colliding.
function buildSessionKey(userId, sessionId) {
  const safeUser = userId === null || userId === undefined ? 'unknown' : String(userId);
  return `${safeUser}:${sessionId}`;
}

class SessionManager {
  constructor() {
    // Store sessions in memory keyed by `${userId}:${sessionId}`
    this.sessions = new Map();
    this.maxSessions = 100;
    this.sessionsDir = path.join(os.homedir(), '.gemini', 'sessions');
    this.ready = this.init();
  }

  async init() {
    await this.initSessionsDir();
    await this.loadSessions();
  }

  async initSessionsDir() {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      // console.error('Error creating sessions directory:', error);
    }
  }

  // Create a new session
  createSession(userId, sessionId, projectPath) {
    const session = {
      id: sessionId,
      userId: userId ?? null,
      projectPath: projectPath,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date()
    };

    // Evict oldest session from memory if we exceed limit
    if (this.sessions.size >= this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) this.sessions.delete(oldestKey);
    }

    const key = buildSessionKey(userId, sessionId);
    this.sessions.set(key, session);
    this.saveSession(userId, sessionId);

    return session;
  }

  // Add a message to session
  addMessage(userId, sessionId, role, content) {
    const key = buildSessionKey(userId, sessionId);
    let session = this.sessions.get(key);

    if (!session) {
      // Create session if it doesn't exist
      session = this.createSession(userId, sessionId, '');
    }

    const message = {
      role: role, // 'user' or 'assistant'
      content: content,
      timestamp: new Date()
    };

    session.messages.push(message);
    session.lastActivity = new Date();

    this.saveSession(userId, sessionId);

    return session;
  }

  // Get session by ID
  getSession(userId, sessionId) {
    return this.sessions.get(buildSessionKey(userId, sessionId));
  }

  // Get all sessions for a project (scoped to user)
  getProjectSessions(userId, projectPath) {
    const sessions = [];
    const userPrefix = `${userId === null || userId === undefined ? 'unknown' : String(userId)}:`;

    for (const [key, session] of this.sessions) {
      if (!key.startsWith(userPrefix)) {
        continue;
      }
      if (session.projectPath === projectPath) {
        sessions.push({
          id: session.id,
          summary: this.getSessionSummary(session),
          messageCount: session.messages.length,
          lastActivity: session.lastActivity
        });
      }
    }

    return sessions.sort((a, b) =>
      new Date(b.lastActivity) - new Date(a.lastActivity)
    );
  }

  // Get session summary
  getSessionSummary(session) {
    if (session.messages.length === 0) {
      return 'New Session';
    }

    // Find first user message
    const firstUserMessage = session.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content;
      return content.length > 50 ? content.substring(0, 50) + '...' : content;
    }

    return 'New Session';
  }

  // Build conversation context for Gemini
  buildConversationContext(userId, sessionId, maxMessages = 10) {
    const session = this.sessions.get(buildSessionKey(userId, sessionId));

    if (!session || session.messages.length === 0) {
      return '';
    }

    // Get last N messages for context
    const recentMessages = session.messages.slice(-maxMessages);

    let context = 'Here is the conversation history:\n\n';

    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        context += `User: ${msg.content}\n`;
      } else {
        context += `Assistant: ${msg.content}\n`;
      }
    }

    context += '\nBased on the conversation history above, please answer the following:\n';

    return context;
  }

  // Prevent path traversal; persisted file name embeds the user id so each
  // user keeps a separate on-disk record of the same session id.
  _safeFilePath(userId, sessionId) {
    const safeId = String(sessionId).replace(/[/\\]|\.\./g, '');
    const safeUser = userId === null || userId === undefined
      ? 'unknown'
      : String(userId).replace(/[/\\]|\.\./g, '');
    return path.join(this.sessionsDir, `${safeUser}-${safeId}.json`);
  }

  // Save session to disk
  async saveSession(userId, sessionId) {
    const session = this.sessions.get(buildSessionKey(userId, sessionId));
    if (!session) return;

    try {
      const filePath = this._safeFilePath(userId, sessionId);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    } catch (error) {
      // console.error('Error saving session:', error);
    }
  }

  // Load sessions from disk
  async loadSessions() {
    try {
      const files = await fs.readdir(this.sessionsDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.sessionsDir, file);
            const data = await fs.readFile(filePath, 'utf8');
            const session = JSON.parse(data);

            // Convert dates
            session.createdAt = new Date(session.createdAt);
            session.lastActivity = new Date(session.lastActivity);
            session.messages.forEach(msg => {
              msg.timestamp = new Date(msg.timestamp);
            });

            // Legacy files without `userId` get bucketed under "unknown" so
            // pre-existing sessions remain reachable until they are rewritten.
            const userId = session.userId ?? null;
            const key = buildSessionKey(userId, session.id);
            this.sessions.set(key, session);
          } catch (error) {
            // console.error(`Error loading session ${file}:`, error);
          }
        }
      }

      // Enforce eviction after loading to prevent massive memory usage
      while (this.sessions.size > this.maxSessions) {
        const oldestKey = this.sessions.keys().next().value;
        if (oldestKey) this.sessions.delete(oldestKey);
      }
    } catch (error) {
      // console.error('Error loading sessions:', error);
    }
  }

  // Delete a session
  async deleteSession(userId, sessionId) {
    this.sessions.delete(buildSessionKey(userId, sessionId));

    try {
      const filePath = this._safeFilePath(userId, sessionId);
      await fs.unlink(filePath);
    } catch (error) {
      // console.error('Error deleting session file:', error);
    }
  }

  // Get session messages for display
  getSessionMessages(userId, sessionId) {
    const session = this.sessions.get(buildSessionKey(userId, sessionId));
    if (!session) return [];

    return session.messages.map(msg => ({
      type: 'message',
      message: {
        role: msg.role,
        content: msg.content
      },
      timestamp: msg.timestamp.toISOString()
    }));
  }
}

// Singleton instance
const sessionManager = new SessionManager();

export const ready = sessionManager.ready;
export default sessionManager;
