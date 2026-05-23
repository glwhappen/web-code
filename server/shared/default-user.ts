/**
 * Default-owner user resolution helper.
 *
 * Some background processes (filesystem watchers, session synchronizers) need
 * a stable user id to attribute synchronized data to but have no
 * request-scoped context. Until the application gains explicit per-user
 * background workers, those flows fall back on the first registered active
 * user as the canonical "owner" of system-wide synchronization output.
 */

import { userDb } from '@/modules/database/index.js';
import { AppError } from '@/shared/utils.js';

/**
 * Returns the numeric id of the first active user in the database.
 *
 * Throws an `AppError` with code `DEFAULT_USER_NOT_AVAILABLE` (HTTP 500) when
 * no users exist yet — callers in background contexts are expected to catch
 * this and skip work gracefully until the first user registers.
 */
export function getDefaultOwnerUserId(): number {
  const user = userDb.getFirstUser();
  if (!user) {
    throw new AppError('No active user available to act as default owner', {
      code: 'DEFAULT_USER_NOT_AVAILABLE',
      statusCode: 500,
    });
  }
  return Number(user.id);
}
