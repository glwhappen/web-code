import { projectsDb } from '@/modules/database/index.js';
import { AppError, normalizeProjectPath } from '@/shared/utils.js';

type AuthorizationDependencies = {
  getProjectPath: (userId: number, projectPath: string) => unknown;
};

const defaultDependencies: AuthorizationDependencies = {
  getProjectPath: projectsDb.getProjectPath.bind(projectsDb),
};

function coerceNumericUserId(userId: unknown): number {
  if (userId === null || userId === undefined) {
    throw new AppError('Authenticated user is required', {
      code: 'AUTHENTICATION_REQUIRED',
      statusCode: 401,
    });
  }

  const numericId = typeof userId === 'number' ? userId : Number.parseInt(String(userId), 10);
  if (Number.isNaN(numericId)) {
    throw new AppError('Authenticated user is required', {
      code: 'AUTHENTICATION_REQUIRED',
      statusCode: 401,
    });
  }

  return numericId;
}

/**
 * Confirms that `requestedPath` is a project registered to `userId`, and
 * returns its canonical (normalized) form.
 *
 * Use this anywhere the server is about to act on a path supplied over the
 * wire — spawn a CLI, register a clone target, etc. — so a user with a valid
 * session cannot pivot to another user's project simply by knowing its path.
 */
export function assertUserOwnsProjectPath(
  userId: unknown,
  requestedPath: unknown,
  dependencies: AuthorizationDependencies = defaultDependencies,
): string {
  const numericUserId = coerceNumericUserId(userId);

  if (typeof requestedPath !== 'string' || requestedPath.trim().length === 0) {
    throw new AppError('A project path is required', {
      code: 'PROJECT_PATH_REQUIRED',
      statusCode: 400,
    });
  }

  const normalized = normalizeProjectPath(requestedPath);
  if (!normalized) {
    throw new AppError('A project path is required', {
      code: 'PROJECT_PATH_REQUIRED',
      statusCode: 400,
    });
  }

  const project = dependencies.getProjectPath(numericUserId, normalized);
  if (!project) {
    throw new AppError('The requested path is not a project owned by the authenticated user', {
      code: 'PROJECT_NOT_OWNED_BY_USER',
      statusCode: 403,
    });
  }

  return normalized;
}
