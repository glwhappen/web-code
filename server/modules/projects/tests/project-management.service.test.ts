import assert from 'node:assert/strict';
import test from 'node:test';

import { createProject, updateProjectRouting } from '@/modules/projects/services/project-management.service.js';
import { projectsDb } from '@/modules/database/index.js';
import { AppError } from '@/shared/utils.js';

const TEST_USER_ID = 1;
const TEST_USERNAME = 'tester';
const TEST_USER_WORKSPACE_ROOT = '/workspace/tester';

const projectRow = {
  project_id: 'project-1',
  project_path: '/workspace/tester/my-project',
  custom_project_name: 'my-project',
  project_host_alias: null,
  isStarred: 0,
  isArchived: 0,
};

const resolveUserWorkspaceRoot = async () => TEST_USER_WORKSPACE_ROOT;

test('createProject throws when project path is missing', async () => {
  await assert.rejects(
    async () => createProject({ userId: TEST_USER_ID, username: TEST_USERNAME, projectPath: '' }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'PROJECT_PATH_REQUIRED');
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test('createProject throws when path validation fails', async () => {
  await assert.rejects(
    async () =>
      createProject(
        { userId: TEST_USER_ID, username: TEST_USERNAME, projectPath: '/invalid/path' },
        {
          validatePath: async () => ({ valid: false, error: 'blocked path' }),
          ensureWorkspaceDirectory: async () => undefined,
          resolveUserWorkspaceRoot,
          persistProjectPath: () => ({ outcome: 'created', project: projectRow }),
          getProjectByPath: () => projectRow,
          getAllProjectPaths: () => [],
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INVALID_PROJECT_PATH');
      assert.equal(error.statusCode, 400);
      assert.equal(error.details, 'blocked path');
      return true;
    },
  );
});

test('createProject throws conflict when active project path already exists', async () => {
  await assert.rejects(
    async () =>
      createProject(
        { userId: TEST_USER_ID, username: TEST_USERNAME, projectPath: '/workspace/tester/my-project' },
        {
          validatePath: async () => ({ valid: true, resolvedPath: '/workspace/tester/my-project' }),
          ensureWorkspaceDirectory: async () => undefined,
          resolveUserWorkspaceRoot,
          persistProjectPath: () => ({ outcome: 'active_conflict', project: projectRow }),
          getProjectByPath: () => projectRow,
          getAllProjectPaths: () => [],
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'PROJECT_ALREADY_EXISTS');
      assert.equal(error.statusCode, 409);
      assert.equal(error.details, 'Project path already exists: /workspace/tester/my-project');
      return true;
    },
  );
});

test('createProject passes the per-user workspace root to validatePath', async () => {
  let capturedWorkspaceRoot = '';

  await createProject(
    { userId: TEST_USER_ID, username: TEST_USERNAME, projectPath: '/workspace/tester/my-project' },
    {
      validatePath: async (_projectPath, workspaceRoot) => {
        capturedWorkspaceRoot = workspaceRoot;
        return { valid: true, resolvedPath: '/workspace/tester/my-project' };
      },
      ensureWorkspaceDirectory: async () => undefined,
      resolveUserWorkspaceRoot,
      persistProjectPath: () => ({ outcome: 'created', project: projectRow }),
      getProjectByPath: () => projectRow,
      getAllProjectPaths: () => [],
    },
  );

  assert.equal(capturedWorkspaceRoot, TEST_USER_WORKSPACE_ROOT);
});

test('createProject falls back to directory name when custom name is not provided', async () => {
  let capturedUserId = 0;
  let capturedCustomName: string | null = null;

  const result = await createProject(
    { userId: TEST_USER_ID, username: TEST_USERNAME, projectPath: '/workspace/tester/my-project', customName: '' },
    {
      validatePath: async () => ({ valid: true, resolvedPath: '/workspace/tester/my-project' }),
      ensureWorkspaceDirectory: async () => undefined,
      resolveUserWorkspaceRoot,
      persistProjectPath: (userId, _projectPath, customName) => {
        capturedUserId = userId;
        capturedCustomName = customName;
        return {
          outcome: 'created',
          project: {
            ...projectRow,
            custom_project_name: customName,
          },
        };
      },
      getProjectByPath: () => projectRow,
      getAllProjectPaths: () => [],
    },
  );

  assert.equal(capturedUserId, TEST_USER_ID);
  assert.equal(capturedCustomName, 'my-project');
  assert.equal(result.outcome, 'created');
  assert.equal(result.project.displayName, 'my-project');
});

test('createProject returns archived reuse outcome when archived row is reused', async () => {
  const result = await createProject(
    { userId: TEST_USER_ID, username: TEST_USERNAME, projectPath: '/workspace/tester/my-project' },
    {
      validatePath: async () => ({ valid: true, resolvedPath: '/workspace/tester/my-project' }),
      ensureWorkspaceDirectory: async () => undefined,
      resolveUserWorkspaceRoot,
      persistProjectPath: () => ({
        outcome: 'reactivated_archived',
        project: {
          ...projectRow,
          isArchived: 1,
        },
      }),
      getProjectByPath: () => projectRow,
      getAllProjectPaths: () => [],
    },
  );

  assert.equal(result.outcome, 'reactivated_archived');
  assert.equal(result.project.isArchived, true);
});

test('createProject rejects duplicate project host aliases', async () => {
  await assert.rejects(
    async () =>
      createProject(
        { userId: TEST_USER_ID, username: TEST_USERNAME, projectPath: '/workspace/tester/other-project', customName: 'test' },
        {
          validatePath: async () => ({ valid: true, resolvedPath: '/workspace/tester/other-project' }),
          ensureWorkspaceDirectory: async () => undefined,
          resolveUserWorkspaceRoot,
          persistProjectPath: () => ({ outcome: 'created', project: projectRow }),
          getProjectByPath: () => projectRow,
          getAllProjectPaths: () => [
            projectRow,
            {
              project_id: 'project-2',
              project_path: '/workspace/tester/existing-project',
              custom_project_name: 'test',
              project_host_alias: null,
              preview_prod_port: null,
              preview_dev_port: null,
              isStarred: 0,
              isArchived: 0,
            },
          ],
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'PROJECT_HOST_ALIAS_CONFLICT');
      assert.equal(error.statusCode, 409);
      return true;
    },
  );
});

test('createProject rejects duplicate preview ports', async () => {
  await assert.rejects(
    async () =>
      createProject(
        {
          userId: TEST_USER_ID,
          username: TEST_USERNAME,
          projectPath: '/workspace/tester/other-project',
          customName: 'other-project',
          previewProdPort: 10003,
        },
        {
          validatePath: async () => ({ valid: true, resolvedPath: '/workspace/tester/other-project' }),
          ensureWorkspaceDirectory: async () => undefined,
          resolveUserWorkspaceRoot,
          persistProjectPath: () => ({ outcome: 'created', project: projectRow }),
          getProjectByPath: () => projectRow,
          getAllProjectPaths: () => [
            projectRow,
            {
              project_id: 'project-2',
              project_path: '/workspace/tester/existing-project',
              custom_project_name: 'existing-project',
              project_host_alias: null,
              preview_prod_port: 10003,
              preview_dev_port: null,
              isStarred: 0,
              isArchived: 0,
            },
          ],
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'PROJECT_PREVIEW_PORT_CONFLICT');
      assert.equal(error.statusCode, 409);
      return true;
    },
  );
});

test('updateProjectRouting persists display name and preview ports after validation', async () => {
  const originalGetProjectById = projectsDb.getProjectById;
  const originalGetAllActiveProjectPaths = projectsDb.getAllActiveProjectPaths;
  const originalUpdateProjectRoutingById = projectsDb.updateProjectRoutingById;

  let capturedArgs: Array<string | number | null> = [];

  try {
    projectsDb.getProjectById = () => ({
      project_id: 'project-1',
      project_path: '/workspace/tester/my-project',
      custom_project_name: 'my-project',
      project_host_alias: null,
      preview_prod_port: 10003,
      preview_dev_port: 10004,
      isStarred: 0,
      isArchived: 0,
    });
    projectsDb.getAllActiveProjectPaths = () => [
      {
        project_id: 'project-1',
        project_path: '/workspace/tester/my-project',
        custom_project_name: 'my-project',
        project_host_alias: null,
        preview_prod_port: 10003,
        preview_dev_port: 10004,
        isStarred: 0,
        isArchived: 0,
      },
    ];
    projectsDb.updateProjectRoutingById = (
      _userId: number,
      _projectId: string,
      projectHostAlias: string | null,
      previewProdPort: number | null,
      previewDevPort: number | null,
    ) => {
      capturedArgs = [projectHostAlias, previewProdPort, previewDevPort];
    };

    updateProjectRouting(TEST_USER_ID, 'project-1', 'test', 10005, 10006);

    assert.deepEqual(capturedArgs, ['test', 10005, 10006]);
  } finally {
    projectsDb.getProjectById = originalGetProjectById;
    projectsDb.getAllActiveProjectPaths = originalGetAllActiveProjectPaths;
    projectsDb.updateProjectRoutingById = originalUpdateProjectRoutingById;
  }
});
