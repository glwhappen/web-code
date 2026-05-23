import { getConnection } from '@/modules/database/connection.js';
import { projectsDb } from '@/modules/database/repositories/projects.db.js';
import { normalizeProjectPath } from '@/shared/utils.js';

type SessionRow = {
  session_id: string;
  user_id: number;
  provider: string;
  project_path: string | null;
  jsonl_path: string | null;
  custom_name: string | null;
  isArchived: number;
  created_at: string;
  updated_at: string;
};

type SessionMetadataLookupRow = Pick<
  SessionRow,
  'session_id' | 'user_id' | 'provider' | 'project_path' | 'jsonl_path' | 'custom_name' | 'isArchived' | 'created_at' | 'updated_at'
>;

function normalizeTimestamp(value?: string): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeProjectPathForProvider(provider: string, projectPath: string): string {
  void provider;
  return normalizeProjectPath(projectPath);
}

export const sessionsDb = {
  createSession(
    userId: number,
    sessionId: string,
    provider: string,
    projectPath: string,
    customName?: string,
    createdAt?: string,
    updatedAt?: string,
    jsonlPath?: string | null
  ): string {
    const db = getConnection();
    const createdAtValue = normalizeTimestamp(createdAt);
    const updatedAtValue = normalizeTimestamp(updatedAt);
    const normalizedProjectPath = normalizeProjectPathForProvider(provider, projectPath);

    // First, ensure the project path is recorded in the projects table,
    // since it's a foreign key in the sessions table.
    projectsDb.createProjectPath(userId, normalizedProjectPath);

    db.prepare(
      `INSERT INTO sessions (session_id, user_id, provider, custom_name, project_path, jsonl_path, isArchived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
       ON CONFLICT(user_id, session_id) DO UPDATE SET
         provider = excluded.provider,
         updated_at = excluded.updated_at,
         project_path = excluded.project_path,
         jsonl_path = excluded.jsonl_path,
         isArchived = 0,
         custom_name = COALESCE(excluded.custom_name, sessions.custom_name)`
    ).run(
      sessionId,
      userId,
      provider,
      customName ?? null,
      normalizedProjectPath,
      jsonlPath ?? null,
      createdAtValue,
      updatedAtValue
    );

    return sessionId;
  },

  updateSessionCustomName(userId: number, sessionId: string, customName: string): void {
    const db = getConnection();
    db.prepare(
      `UPDATE sessions
       SET custom_name = ?
       WHERE user_id = ? AND session_id = ?`
    ).run(customName, userId, sessionId);
  },

  getSessionById(userId: number, sessionId: string): SessionMetadataLookupRow | null {
    const db = getConnection();
    const row = db
      .prepare(
        `SELECT session_id, user_id, provider, project_path, jsonl_path, custom_name, isArchived, created_at, updated_at
         FROM sessions
         WHERE user_id = ? AND session_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(userId, sessionId) as SessionMetadataLookupRow | undefined;

    return row ?? null;
  },

  getAllSessions(userId: number): SessionRow[] {
    const db = getConnection();
    return db
      .prepare(
        `SELECT session_id, user_id, provider, project_path, jsonl_path, custom_name, isArchived, created_at, updated_at
         FROM sessions
         WHERE user_id = ? AND isArchived = 0`
      )
      .all(userId) as SessionRow[];
  },

  /**
   * Archived rows are intentionally queried separately so the caller can render
   * them in a dedicated view without reintroducing them into active session lists.
   */
  getArchivedSessions(userId: number): SessionRow[] {
    const db = getConnection();
    return db
      .prepare(
        `SELECT session_id, user_id, provider, project_path, jsonl_path, custom_name, isArchived, created_at, updated_at
         FROM sessions
         WHERE user_id = ? AND isArchived = 1
         ORDER BY datetime(COALESCE(updated_at, created_at)) DESC, session_id DESC`
      )
      .all(userId) as SessionRow[];
  },

  getSessionsByProjectPath(userId: number, projectPath: string): SessionRow[] {
    const db = getConnection();
    const normalizedProjectPath = normalizeProjectPath(projectPath);
    return db
      .prepare(
        `SELECT session_id, user_id, provider, project_path, jsonl_path, custom_name, isArchived, created_at, updated_at
         FROM sessions
         WHERE user_id = ? AND project_path = ?
           AND isArchived = 0`
      )
      .all(userId, normalizedProjectPath) as SessionRow[];
  },

  /**
   * Permanent project deletion must see every session row for the path,
   * including archived ones, so their transcript files can be cleaned up.
   */
  getSessionsByProjectPathIncludingArchived(userId: number, projectPath: string): SessionRow[] {
    const db = getConnection();
    const normalizedProjectPath = normalizeProjectPath(projectPath);
    return db
      .prepare(
        `SELECT session_id, user_id, provider, project_path, jsonl_path, custom_name, isArchived, created_at, updated_at
         FROM sessions
         WHERE user_id = ? AND project_path = ?`
      )
      .all(userId, normalizedProjectPath) as SessionRow[];
  },

  getSessionsByProjectPathPage(userId: number, projectPath: string, limit: number, offset: number): SessionRow[] {
    const db = getConnection();
    const normalizedProjectPath = normalizeProjectPath(projectPath);
    return db
      .prepare(
        `SELECT session_id, user_id, provider, project_path, jsonl_path, custom_name, isArchived, created_at, updated_at
         FROM sessions
         WHERE user_id = ? AND project_path = ?
           AND isArchived = 0
         ORDER BY datetime(COALESCE(updated_at, created_at)) DESC, session_id DESC
         LIMIT ? OFFSET ?`
      )
      .all(userId, normalizedProjectPath, limit, offset) as SessionRow[];
  },

  countSessionsByProjectPath(userId: number, projectPath: string): number {
    const db = getConnection();
    const normalizedProjectPath = normalizeProjectPath(projectPath);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM sessions
         WHERE user_id = ? AND project_path = ?
           AND isArchived = 0`
      )
      .get(userId, normalizedProjectPath) as { count: number } | undefined;

    return Number(row?.count ?? 0);
  },

  deleteSessionsByProjectPath(userId: number, projectPath: string): void {
    const db = getConnection();
    const normalizedProjectPath = normalizeProjectPath(projectPath);
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND project_path = ?`).run(userId, normalizedProjectPath);
  },

  getSessionName(userId: number, sessionId: string, provider: string): string | null {
    const db = getConnection();
    const row = db
      .prepare(
        `SELECT custom_name
         FROM sessions
         WHERE user_id = ? AND session_id = ? AND provider = ?`
      )
      .get(userId, sessionId, provider) as { custom_name: string | null } | undefined;

    return row?.custom_name ?? null;
  },

  /**
   * Soft-delete and restore both use the same flag update so callers keep the
   * row, metadata, and file path intact while toggling visibility.
   */
  updateSessionIsArchived(userId: number, sessionId: string, isArchived: boolean): void {
    const db = getConnection();
    db.prepare(
      `UPDATE sessions
       SET isArchived = ?
       WHERE user_id = ? AND session_id = ?`
    ).run(isArchived ? 1 : 0, userId, sessionId);
  },

  deleteSessionById(userId: number, sessionId: string): boolean {
    const db = getConnection();
    return (
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND session_id = ?').run(userId, sessionId).changes > 0
    );
  },
};
