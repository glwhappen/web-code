import assert from 'node:assert/strict';
import test from 'node:test';

import { assertUserOwnsProjectPath } from '@/modules/projects/services/project-authorization.service.js';
import { AppError } from '@/shared/utils.js';

const TEST_USER_ID = 7;
const OWNED_PATH = '/workspace/tester/my-project';

function buildDependencies(found: boolean) {
  return {
    getProjectPath: () => (found ? { project_id: 'p1' } : null),
  };
}

test('assertUserOwnsProjectPath returns the normalized path when the user owns it', () => {
  const result = assertUserOwnsProjectPath(TEST_USER_ID, `${OWNED_PATH}/`, buildDependencies(true));
  assert.equal(result, OWNED_PATH);
});

test('assertUserOwnsProjectPath throws AUTHENTICATION_REQUIRED when userId is missing', () => {
  assert.throws(
    () => assertUserOwnsProjectPath(undefined, OWNED_PATH, buildDependencies(true)),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'AUTHENTICATION_REQUIRED');
      assert.equal(error.statusCode, 401);
      return true;
    },
  );
});

test('assertUserOwnsProjectPath throws PROJECT_PATH_REQUIRED when path is blank', () => {
  assert.throws(
    () => assertUserOwnsProjectPath(TEST_USER_ID, '   ', buildDependencies(true)),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'PROJECT_PATH_REQUIRED');
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test('assertUserOwnsProjectPath throws PROJECT_NOT_OWNED_BY_USER when the project is not registered for the user', () => {
  assert.throws(
    () => assertUserOwnsProjectPath(TEST_USER_ID, OWNED_PATH, buildDependencies(false)),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'PROJECT_NOT_OWNED_BY_USER');
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});

test('assertUserOwnsProjectPath coerces stringified userIds', () => {
  let receivedUserId: number | null = null;
  const dependencies = {
    getProjectPath: (userId: number) => {
      receivedUserId = userId;
      return { project_id: 'p1' };
    },
  };

  assertUserOwnsProjectPath('42', OWNED_PATH, dependencies);
  assert.equal(receivedUserId, 42);
});
