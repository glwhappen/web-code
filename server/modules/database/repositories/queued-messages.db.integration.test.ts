import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection } from '@/modules/database/connection.js';
import { initializeDatabase } from '@/modules/database/init-db.js';
import { queuedMessagesDb } from '@/modules/database/repositories/queued-messages.db.js';
import { sessionsDb } from '@/modules/database/repositories/sessions.db.js';
import { userDb } from '@/modules/database/repositories/users.js';

async function withIsolatedDatabase(
  runTest: (userId: number) => void | Promise<void>,
): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'queued-messages-db-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await initializeDatabase();

  const created = userDb.createUser('test-user', 'hash');
  const userId = Number(created.id);

  try {
    await runTest(userId);
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('queuedMessagesDb persists queued messages in insertion order', async () => {
  await withIsolatedDatabase((userId) => {
    sessionsDb.createSession(userId, 'session-1', 'claude', '/workspace/demo-project', 'Demo');

    const first = queuedMessagesDb.create(userId, 'session-1', {
      provider: 'claude',
      content: 'first queued prompt',
      permissionMode: 'default',
      model: 'claude-sonnet',
    });
    const second = queuedMessagesDb.create(userId, 'session-1', {
      provider: 'codex',
      content: 'second queued prompt',
      permissionMode: 'auto',
      model: 'gpt-5.2',
    });

    const messages = queuedMessagesDb.listBySession(userId, 'session-1');

    assert.deepEqual(messages.map((message) => message.id), [first.id, second.id]);
    assert.deepEqual(messages.map((message) => message.content), ['first queued prompt', 'second queued prompt']);
  });
});

test('queuedMessagesDb updates and deletes individual queued messages', async () => {
  await withIsolatedDatabase((userId) => {
    sessionsDb.createSession(userId, 'session-1', 'claude', '/workspace/demo-project', 'Demo');
    const message = queuedMessagesDb.create(userId, 'session-1', {
      provider: 'claude',
      content: 'old content',
    });

    const updated = queuedMessagesDb.update(userId, 'session-1', message.id, {
      content: 'new content',
      permissionMode: 'acceptEdits',
      metadata: { source: 'test' },
    });

    assert.equal(updated?.content, 'new content');
    assert.equal(updated?.permissionMode, 'acceptEdits');
    assert.deepEqual(updated?.metadata, { source: 'test' });
    assert.equal(queuedMessagesDb.delete(userId, 'session-1', message.id), true);
    assert.deepEqual(queuedMessagesDb.listBySession(userId, 'session-1'), []);
  });
});

test('queuedMessagesDb can reassign and bulk-delete queued messages by session', async () => {
  await withIsolatedDatabase((userId) => {
    sessionsDb.createSession(userId, 'session-1', 'claude', '/workspace/demo-project', 'Demo');
    sessionsDb.createSession(userId, 'session-2', 'claude', '/workspace/demo-project', 'Demo 2');
    queuedMessagesDb.create(userId, 'session-1', {
      provider: 'claude',
      content: 'queued one',
    });
    queuedMessagesDb.create(userId, 'session-1', {
      provider: 'claude',
      content: 'queued two',
    });

    const moved = queuedMessagesDb.reassignSession(userId, 'session-1', 'session-2');
    assert.equal(moved, 2);
    assert.equal(queuedMessagesDb.listBySession(userId, 'session-1').length, 0);
    assert.equal(queuedMessagesDb.listBySession(userId, 'session-2').length, 2);

    const deletedCount = queuedMessagesDb.deleteBySession(userId, 'session-2');
    assert.equal(deletedCount, 2);
    assert.equal(queuedMessagesDb.listBySession(userId, 'session-2').length, 0);
  });
});
