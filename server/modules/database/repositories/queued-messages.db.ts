import { randomUUID } from 'node:crypto';

import { getConnection } from '@/modules/database/connection.js';

export type QueuedMessageRow = {
  id: string;
  user_id: number;
  session_id: string;
  provider: string;
  content: string;
  permission_mode: string | null;
  model: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

export type QueuedMessage = {
  id: string;
  userId: number;
  sessionId: string;
  provider: string;
  content: string;
  permissionMode: string | null;
  model: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

type CreateQueuedMessageInput = {
  provider: string;
  content: string;
  permissionMode?: string | null;
  model?: string | null;
  metadata?: unknown;
};

type UpdateQueuedMessageInput = Partial<Pick<CreateQueuedMessageInput, 'content' | 'permissionMode' | 'model' | 'metadata'>>;

function serializeMetadata(metadata: unknown): string | null {
  if (metadata === undefined || metadata === null) {
    return null;
  }
  return JSON.stringify(metadata);
}

function parseMetadata(metadataJson: string | null): unknown {
  if (!metadataJson) {
    return null;
  }

  try {
    return JSON.parse(metadataJson);
  } catch {
    return null;
  }
}

function mapQueuedMessage(row: QueuedMessageRow): QueuedMessage {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    provider: row.provider,
    content: row.content,
    permissionMode: row.permission_mode,
    model: row.model,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const queuedMessagesDb = {
  listBySession(userId: number, sessionId: string): QueuedMessage[] {
    const db = getConnection();
    const rows = db
      .prepare(
        `SELECT id, user_id, session_id, provider, content, permission_mode, model, metadata_json, created_at, updated_at
         FROM queued_messages
         WHERE user_id = ? AND session_id = ?
         ORDER BY rowid ASC`
      )
      .all(userId, sessionId) as QueuedMessageRow[];

    return rows.map(mapQueuedMessage);
  },

  create(userId: number, sessionId: string, input: CreateQueuedMessageInput): QueuedMessage {
    const db = getConnection();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO queued_messages (id, user_id, session_id, provider, content, permission_mode, model, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      sessionId,
      input.provider,
      input.content,
      input.permissionMode ?? null,
      input.model ?? null,
      serializeMetadata(input.metadata),
    );

    return this.getById(userId, sessionId, id)!;
  },

  getById(userId: number, sessionId: string, id: string): QueuedMessage | null {
    const db = getConnection();
    const row = db
      .prepare(
        `SELECT id, user_id, session_id, provider, content, permission_mode, model, metadata_json, created_at, updated_at
         FROM queued_messages
         WHERE user_id = ? AND session_id = ? AND id = ?
         LIMIT 1`
      )
      .get(userId, sessionId, id) as QueuedMessageRow | undefined;

    return row ? mapQueuedMessage(row) : null;
  },

  update(userId: number, sessionId: string, id: string, input: UpdateQueuedMessageInput): QueuedMessage | null {
    const existing = this.getById(userId, sessionId, id);
    if (!existing) {
      return null;
    }

    const db = getConnection();
    db.prepare(
      `UPDATE queued_messages
       SET content = ?, permission_mode = ?, model = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND session_id = ? AND id = ?`
    ).run(
      input.content ?? existing.content,
      input.permissionMode ?? existing.permissionMode,
      input.model ?? existing.model,
      input.metadata === undefined ? serializeMetadata(existing.metadata) : serializeMetadata(input.metadata),
      userId,
      sessionId,
      id,
    );

    return this.getById(userId, sessionId, id);
  },

  delete(userId: number, sessionId: string, id: string): boolean {
    const db = getConnection();
    return db
      .prepare('DELETE FROM queued_messages WHERE user_id = ? AND session_id = ? AND id = ?')
      .run(userId, sessionId, id).changes > 0;
  },
};
