/**
 * User repository.
 *
 * Provides typed CRUD operations for the `users` table.
 */

import { getConnection } from '@/modules/database/connection.js';

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  last_login: string | null;
  is_active: number;
  git_name: string | null;
  git_email: string | null;
  has_completed_onboarding: number;
  is_admin: number;
};

type UserPublicRow = {
  id: number;
  username: string;
  created_at: string;
  last_login: string | null;
  isAdmin: boolean;
};

type UserGitConfig = {
  git_name: string | null;
  git_email: string | null;
};

type CreateUserOptions = {
  isAdmin?: boolean;
};

type CreateUserResult = {
  id: number;
  username: string;
  isAdmin: boolean;
};

const normalizePublicUser = (
  row:
    | Pick<UserRow, 'id' | 'username' | 'created_at' | 'last_login' | 'is_admin'>
    | undefined,
): UserPublicRow | undefined => {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    username: row.username,
    created_at: row.created_at,
    last_login: row.last_login,
    isAdmin: row.is_admin === 1,
  };
};

export const userDb = {
  /** Returns true if at least one user exists in the database. */
  hasUsers(): boolean {
    const db = getConnection();
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as {
      count: number;
    };
    return row.count > 0;
  },

  /** Inserts a new user and returns the created public fields. */
  createUser(username: string, passwordHash: string, options: CreateUserOptions = {}): CreateUserResult {
    const db = getConnection();
    const isAdmin = options.isAdmin ?? false;
    const result = db
      .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
      .run(username, passwordHash, isAdmin ? 1 : 0);

    return {
      id: Number(result.lastInsertRowid),
      username,
      isAdmin,
    };
  },

  /** Looks up an active user by username, including password hash for auth verification. */
  getUserByUsername(username: string): UserRow | undefined {
    const db = getConnection();
    return db
      .prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
      .get(username) as UserRow | undefined;
  },

  /** Updates the last_login timestamp. Non-fatal — logs but does not throw. */
  updateLastLogin(userId: number): void {
    try {
      const db = getConnection();
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to update last login', { error: message });
    }
  },

  /** Returns public user fields by ID (no password hash). */
  getUserById(userId: number): UserPublicRow | undefined {
    const db = getConnection();
    const row = db
      .prepare(
        'SELECT id, username, created_at, last_login, is_admin FROM users WHERE id = ? AND is_active = 1'
      )
      .get(userId) as Pick<UserRow, 'id' | 'username' | 'created_at' | 'last_login' | 'is_admin'> | undefined;

    return normalizePublicUser(row);
  },

  /** Returns the first active user. Used for single-user mode lookups. */
  getFirstUser(): UserPublicRow | undefined {
    const db = getConnection();
    const row = db
      .prepare(
        'SELECT id, username, created_at, last_login, is_admin FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
      )
      .get() as Pick<UserRow, 'id' | 'username' | 'created_at' | 'last_login' | 'is_admin'> | undefined;

    return normalizePublicUser(row);
  },

  listUsers(): UserPublicRow[] {
    const db = getConnection();
    const rows = db
      .prepare(
        'SELECT id, username, created_at, last_login, is_admin FROM users WHERE is_active = 1 ORDER BY id ASC'
      )
      .all() as Array<Pick<UserRow, 'id' | 'username' | 'created_at' | 'last_login' | 'is_admin'>>;

    return rows.map((row) => normalizePublicUser(row)).filter(Boolean) as UserPublicRow[];
  },

  deleteUser(userId: number): boolean {
    const db = getConnection();
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return result.changes > 0;
  },

  /** Stores the user's preferred git name and email. */
  updateGitConfig(userId: number, gitName: string, gitEmail: string): void {
    const db = getConnection();
    db.prepare('UPDATE users SET git_name = ?, git_email = ? WHERE id = ?').run(
      gitName,
      gitEmail,
      userId,
    );
  },

  /** Retrieves the user's git identity (name + email). */
  getGitConfig(userId: number): UserGitConfig | undefined {
    const db = getConnection();
    return db
      .prepare('SELECT git_name, git_email FROM users WHERE id = ?')
      .get(userId) as UserGitConfig | undefined;
  },

  /** Marks onboarding as complete for the given user. */
  completeOnboarding(userId: number): void {
    const db = getConnection();
    db.prepare('UPDATE users SET has_completed_onboarding = 1 WHERE id = ?').run(userId);
  },

  /** Returns true if the user has finished the onboarding flow. */
  hasCompletedOnboarding(userId: number): boolean {
    const db = getConnection();
    const row = db
      .prepare('SELECT has_completed_onboarding FROM users WHERE id = ?')
      .get(userId) as { has_completed_onboarding: number } | undefined;
    return row?.has_completed_onboarding === 1;
  },
};
