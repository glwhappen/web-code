import fs from 'node:fs/promises';
import path from 'node:path';

import { projectsDb } from '@/modules/database/index.js';
import type {
  CreateProjectPathResult,
  ProjectRepositoryRow,
  WorkspacePathValidationResult,
} from '@/shared/types.js';
import {
  AppError,
  ensureUserWorkspaceRoot,
  normalizeProjectPath,
  validateWorkspacePath,
} from '@/shared/utils.js';

import { projectDisplayNameToHostLabel } from '../../../../shared/projectHosts.js';

type CreateProjectInput = {
  userId: number;
  username: string;
  projectPath: string;
  customName?: string | null;
  previewProdPort?: number | null;
  previewDevPort?: number | null;
};

type CreateProjectDependencies = {
  validatePath: (projectPath: string, workspaceRoot: string) => Promise<WorkspacePathValidationResult>;
  ensureWorkspaceDirectory: (projectPath: string) => Promise<void>;
  resolveUserWorkspaceRoot: (username: string) => Promise<string>;
  persistProjectPath: (
    userId: number,
    projectPath: string,
    customName: string | null,
    previewProdPort?: number | null,
    previewDevPort?: number | null,
  ) => CreateProjectPathResult;
  getProjectByPath: (userId: number, projectPath: string) => ProjectRepositoryRow | null;
  getAllProjectPaths: () => ProjectRepositoryRow[];
};

type ProjectApiView = {
  projectId: string;
  path: string;
  fullPath: string;
  displayName: string;
  customName: string | null;
  previewProdPort: number | null;
  previewDevPort: number | null;
  isArchived: boolean;
  isStarred: boolean;
  sessions: [];
  cursorSessions: [];
  codexSessions: [];
  geminiSessions: [];
  opencodeSessions: [];
  sessionMeta: {
    hasMore: false;
    total: 0;
  };
};

type CreateProjectServiceResult = {
  outcome: 'created' | 'reactivated_archived';
  project: ProjectApiView;
};

const defaultDependencies: CreateProjectDependencies = {
  validatePath: validateWorkspacePath,
  ensureWorkspaceDirectory: async (projectPath: string): Promise<void> => {
    await fs.mkdir(projectPath, { recursive: true });
    const directoryStats = await fs.stat(projectPath);
    if (!directoryStats.isDirectory()) {
      throw new AppError('Path exists but is not a directory', {
        code: 'PROJECT_PATH_NOT_DIRECTORY',
        statusCode: 400,
      });
    }
  },
  resolveUserWorkspaceRoot: ensureUserWorkspaceRoot,
  persistProjectPath: (
    userId: number,
    projectPath: string,
    customName: string | null,
    previewProdPort?: number | null,
    previewDevPort?: number | null,
  ): CreateProjectPathResult =>
    projectsDb.createProjectPath(userId, projectPath, customName, previewProdPort, previewDevPort),
  getProjectByPath: (userId: number, projectPath: string): ProjectRepositoryRow | null =>
    projectsDb.getProjectPath(userId, projectPath),
  getAllProjectPaths: (): ProjectRepositoryRow[] => projectsDb.getAllProjectPaths(),
};

function resolveDisplayName(customName: string | null | undefined, projectPath: string): string {
  const trimmedCustomName = typeof customName === 'string' ? customName.trim() : '';
  if (trimmedCustomName.length > 0) {
    return trimmedCustomName;
  }

  return path.basename(projectPath) || projectPath;
}

function resolveProjectHostLabel(displayName: string, projectPath: string): string {
  return projectDisplayNameToHostLabel(displayName, projectPath);
}

function normalizePreviewPort(port: unknown): number | null {
  if (typeof port !== 'number' || !Number.isFinite(port)) {
    return null;
  }

  const normalizedPort = Math.floor(port);
  if (normalizedPort < 1 || normalizedPort > 65535) {
    return null;
  }

  return normalizedPort;
}

function assertProjectHostLabelIsAvailable(
  desiredDisplayName: string,
  projectPath: string,
  projectRows: ProjectRepositoryRow[],
  currentProjectId: string | null = null,
): void {
  const desiredLabel = resolveProjectHostLabel(desiredDisplayName, projectPath);
  if (!desiredLabel) {
    return;
  }

  const conflictingProject = projectRows.find((projectRow) => {
    if (currentProjectId && projectRow.project_id === currentProjectId) {
      return false;
    }

    const existingDisplayName = resolveDisplayName(projectRow.custom_project_name, projectRow.project_path);
    const existingLabel = resolveProjectHostLabel(existingDisplayName, projectRow.project_path);
    return existingLabel === desiredLabel;
  });

  if (conflictingProject) {
    throw new AppError('Project host alias already exists', {
      code: 'PROJECT_HOST_ALIAS_CONFLICT',
      statusCode: 409,
      details: `Project host alias "${desiredLabel}" is already in use. Choose a different English project name.`,
    });
  }
}

function assertProjectPreviewPortsAreAvailable(
  desiredPreviewProdPort: number | null,
  desiredPreviewDevPort: number | null,
  projectRows: ProjectRepositoryRow[],
  currentProjectId: string | null = null,
): void {
  if (
    desiredPreviewProdPort !== null &&
    desiredPreviewDevPort !== null &&
    desiredPreviewProdPort === desiredPreviewDevPort
  ) {
    throw new AppError('Production and development preview ports must be different', {
      code: 'PROJECT_PREVIEW_PORT_CONFLICT',
      statusCode: 409,
      details: `Preview ports ${desiredPreviewProdPort} and ${desiredPreviewDevPort} cannot point to the same port.`,
    });
  }

  const usedPorts = new Map<number, { projectRow: ProjectRepositoryRow; field: 'prod' | 'dev' }>();
  for (const projectRow of projectRows) {
    if (currentProjectId && projectRow.project_id === currentProjectId) {
      continue;
    }

    const prodPort = normalizePreviewPort(projectRow.preview_prod_port);
    if (prodPort !== null && !usedPorts.has(prodPort)) {
      usedPorts.set(prodPort, { projectRow, field: 'prod' });
    }

    const devPort = normalizePreviewPort(projectRow.preview_dev_port);
    if (devPort !== null && !usedPorts.has(devPort)) {
      usedPorts.set(devPort, { projectRow, field: 'dev' });
    }
  }

  const desiredPorts: Array<{ value: number; field: 'prod' | 'dev' }> = [];
  if (desiredPreviewProdPort !== null) {
    desiredPorts.push({ value: desiredPreviewProdPort, field: 'prod' });
  }
  if (desiredPreviewDevPort !== null) {
    desiredPorts.push({ value: desiredPreviewDevPort, field: 'dev' });
  }

  for (const desiredPort of desiredPorts) {
    const conflict = usedPorts.get(desiredPort.value);
    if (!conflict) {
      continue;
    }

    const conflictedProjectName = resolveDisplayName(conflict.projectRow.custom_project_name, conflict.projectRow.project_path);
    throw new AppError('Preview port already exists', {
      code: 'PROJECT_PREVIEW_PORT_CONFLICT',
      statusCode: 409,
      details: `Port ${desiredPort.value} is already used by project "${conflictedProjectName}" (${conflict.field === 'prod' ? 'production' : 'development'}).`,
    });
  }
}

function assertProjectRoutingIsAvailable(
  desiredDisplayName: string,
  projectPath: string,
  desiredPreviewProdPort: number | null,
  desiredPreviewDevPort: number | null,
  projectRows: ProjectRepositoryRow[],
  currentProjectId: string | null = null,
): void {
  assertProjectHostLabelIsAvailable(desiredDisplayName, projectPath, projectRows, currentProjectId);
  assertProjectPreviewPortsAreAvailable(desiredPreviewProdPort, desiredPreviewDevPort, projectRows, currentProjectId);
}

function mapProjectRowToApiView(projectRow: ProjectRepositoryRow): ProjectApiView {
  return {
    projectId: projectRow.project_id,
    path: projectRow.project_path,
    fullPath: projectRow.project_path,
    displayName: resolveDisplayName(projectRow.custom_project_name, projectRow.project_path),
    customName: projectRow.custom_project_name,
    previewProdPort: projectRow.preview_prod_port ?? null,
    previewDevPort: projectRow.preview_dev_port ?? null,
    isArchived: Boolean(projectRow.isArchived),
    isStarred: Boolean(projectRow.isStarred),
    sessions: [],
    cursorSessions: [],
    codexSessions: [],
    geminiSessions: [],
    opencodeSessions: [],
    sessionMeta: {
      hasMore: false,
      total: 0,
    },
  };
}

export async function createProject(
  input: CreateProjectInput,
  dependencies: CreateProjectDependencies = defaultDependencies,
): Promise<CreateProjectServiceResult> {
  if (!Number.isFinite(input.userId)) {
    throw new AppError('userId is required', {
      code: 'AUTHENTICATION_REQUIRED',
      statusCode: 401,
    });
  }

  const normalizedPath = normalizeProjectPath(input.projectPath || '');
  if (!normalizedPath) {
    throw new AppError('path is required', {
      code: 'PROJECT_PATH_REQUIRED',
      statusCode: 400,
    });
  }

  const userWorkspaceRoot = await dependencies.resolveUserWorkspaceRoot(input.username);
  const pathValidation = await dependencies.validatePath(normalizedPath, userWorkspaceRoot);
  if (!pathValidation.valid || !pathValidation.resolvedPath) {
    throw new AppError('Invalid project path', {
      code: 'INVALID_PROJECT_PATH',
      statusCode: 400,
      details: pathValidation.error ?? 'Path validation failed',
    });
  }

  const resolvedProjectPath = normalizeProjectPath(pathValidation.resolvedPath);
  await dependencies.ensureWorkspaceDirectory(resolvedProjectPath);

  const normalizedCustomName = resolveDisplayName(input.customName ?? null, resolvedProjectPath);
  const normalizedPreviewProdPort = normalizePreviewPort(input.previewProdPort ?? null);
  const normalizedPreviewDevPort = normalizePreviewPort(input.previewDevPort ?? null);
  assertProjectRoutingIsAvailable(
    normalizedCustomName,
    resolvedProjectPath,
    normalizedPreviewProdPort,
    normalizedPreviewDevPort,
    dependencies.getAllProjectPaths(),
  );
  const persistedProject = dependencies.persistProjectPath(
    input.userId,
    resolvedProjectPath,
    normalizedCustomName,
    normalizedPreviewProdPort,
    normalizedPreviewDevPort,
  );

  if (persistedProject.outcome === 'active_conflict') {
    throw new AppError('Project path already exists and is active', {
      code: 'PROJECT_ALREADY_EXISTS',
      statusCode: 409,
      details: `Project path already exists: ${resolvedProjectPath}`,
    });
  }

  const projectRow = persistedProject.project ?? dependencies.getProjectByPath(input.userId, resolvedProjectPath);
  if (!projectRow) {
    throw new AppError('Failed to resolve project after creation', {
      code: 'PROJECT_CREATE_FAILED',
      statusCode: 500,
    });
  }

  // Archived rows intentionally remain archived when reused, as requested.
  return {
    outcome: persistedProject.outcome,
    project: mapProjectRowToApiView(projectRow),
  };
}

/**
 * Sets `projects.custom_project_name` for the given user + `projectId` (or clears it when empty).
 */
export function updateProjectDisplayName(userId: number, projectId: string, newDisplayName: unknown): void {
  const trimmed = typeof newDisplayName === 'string' ? newDisplayName.trim() : '';
  const currentProject = projectsDb.getProjectById(userId, projectId);
  if (currentProject) {
    const nextDisplayName = trimmed.length > 0 ? trimmed : resolveDisplayName(null, currentProject.project_path);
    assertProjectHostLabelIsAvailable(
      nextDisplayName,
      currentProject.project_path,
      projectsDb.getAllProjectPaths(),
      projectId,
    );
  }
  projectsDb.updateCustomProjectNameById(userId, projectId, trimmed.length > 0 ? trimmed : null);
}

export function updateProjectPreviewPorts(
  userId: number,
  projectId: string,
  previewProdPort: unknown,
  previewDevPort: unknown,
): void {
  const currentProject = projectsDb.getProjectById(userId, projectId);
  if (!currentProject) {
    throw new AppError('Project not found', {
      code: 'PROJECT_NOT_FOUND',
      statusCode: 404,
    });
  }

  const normalizedPreviewProdPort = normalizePreviewPort(previewProdPort);
  const normalizedPreviewDevPort = normalizePreviewPort(previewDevPort);
  assertProjectPreviewPortsAreAvailable(
    normalizedPreviewProdPort,
    normalizedPreviewDevPort,
    projectsDb.getAllActiveProjectPaths(),
    projectId,
  );

  projectsDb.updateProjectPreviewPortsById(
    userId,
    projectId,
    normalizedPreviewProdPort,
    normalizedPreviewDevPort,
  );
}

export function updateProjectRouting(
  userId: number,
  projectId: string,
  displayName: unknown,
  previewProdPort: unknown,
  previewDevPort: unknown,
): void {
  const currentProject = projectsDb.getProjectById(userId, projectId);
  if (!currentProject) {
    throw new AppError('Project not found', {
      code: 'PROJECT_NOT_FOUND',
      statusCode: 404,
    });
  }

  const trimmedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
  const resolvedDisplayName = trimmedDisplayName.length > 0
    ? trimmedDisplayName
    : resolveDisplayName(null, currentProject.project_path);
  const normalizedPreviewProdPort = normalizePreviewPort(previewProdPort);
  const normalizedPreviewDevPort = normalizePreviewPort(previewDevPort);

  assertProjectRoutingIsAvailable(
    resolvedDisplayName,
    currentProject.project_path,
    normalizedPreviewProdPort,
    normalizedPreviewDevPort,
    projectsDb.getAllActiveProjectPaths(),
    projectId,
  );

  projectsDb.updateProjectRoutingById(
    userId,
    projectId,
    trimmedDisplayName.length > 0 ? trimmedDisplayName : null,
    normalizedPreviewProdPort,
    normalizedPreviewDevPort,
  );
}
