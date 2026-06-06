import { promises as fs } from 'node:fs';
import path from 'node:path';

import { projectsDb, sessionsDb } from '@/modules/database/index.js';
import { AppError } from '@/shared/utils.js';

function uniqueJsonlPathsFromSessions(
  sessions: Array<{ jsonl_path: string | null }>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const row of sessions) {
    const raw = row.jsonl_path?.trim();
    if (!raw) {
      continue;
    }
    const absolute = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(raw);
    if (seen.has(absolute)) {
      continue;
    }
    seen.add(absolute);
    result.push(absolute);
  }

  return result;
}

async function unlinkJsonlIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return;
    }
    console.warn(`[project-delete] Failed to remove ${filePath}:`, (error as Error).message);
  }
}

/**
 * Loads all session rows for the project path (scoped to the user) and
 * removes each distinct `jsonl_path` file on disk.
 */
export async function deleteSessionJsonlFilesForProjectPath(userId: number, projectPath: string): Promise<void> {
  const sessions = sessionsDb.getSessionsByProjectPathIncludingArchived(userId, projectPath);
  const paths = uniqueJsonlPathsFromSessions(sessions);

  for (const filePath of paths) {
    await unlinkJsonlIfExists(filePath);
  }
}

/**
 * - **Soft delete** (`force` false): set `isArchived` on the `projects` row (hide from the active list; DB only).
 * - **Force** (`force` true): for each session row for that `project_path`, delete the file at `jsonl_path`
 *   (when set), then remove session rows and the `projects` row.
 *
 * All operations are scoped to the authenticated `userId` so users only ever
 * mutate rows they own.
 */
export async function deleteOrArchiveProject(userId: number, projectId: string, force: boolean): Promise<void> {
  const row = projectsDb.getProjectById(userId, projectId);
  if (!row) {
    throw new AppError(`Unknown projectId: ${projectId}`, {
      code: 'PROJECT_NOT_FOUND',
      statusCode: 404,
    });
  }

  if (!force) {
    projectsDb.updateProjectIsArchivedById(userId, projectId, true);
    return;
  }

  await deleteSessionJsonlFilesForProjectPath(userId, row.project_path);
  sessionsDb.deleteSessionsByProjectPath(userId, row.project_path);
  projectsDb.deleteProjectById(userId, projectId);
}

/**
 * Restores one archived project row back into the active project list (scoped
 * to the requesting user).
 */
export function restoreArchivedProject(userId: number, projectId: string): void {
  const row = projectsDb.getProjectById(userId, projectId);
  if (!row) {
    throw new AppError(`Unknown projectId: ${projectId}`, {
      code: 'PROJECT_NOT_FOUND',
      statusCode: 404,
    });
  }

  projectsDb.updateProjectIsArchivedById(userId, projectId, false);
}
