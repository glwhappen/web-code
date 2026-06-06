import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collapseWorkspacePathForDisplay,
  expandWorkspacePathFromRoot,
  validateWorkspacePath,
} from '@/shared/utils.js';

test('expandWorkspacePathFromRoot maps tilde paths into the user workspace root', () => {
  const workspaceRoot = '/root/web-code-workspaces/tester';

  assert.equal(expandWorkspacePathFromRoot('~', workspaceRoot), workspaceRoot);
  assert.equal(
    expandWorkspacePathFromRoot('~/demo-project', workspaceRoot),
    '/root/web-code-workspaces/tester/demo-project',
  );
});

test('collapseWorkspacePathForDisplay maps user workspace paths back to tilde display paths', () => {
  const workspaceRoot = '/root/web-code-workspaces/tester';

  assert.equal(collapseWorkspacePathForDisplay(workspaceRoot, workspaceRoot), '~');
  assert.equal(
    collapseWorkspacePathForDisplay('/root/web-code-workspaces/tester/demo-project', workspaceRoot),
    '~/demo-project',
  );
});

test('validateWorkspacePath allows configured workspace roots under /root when explicitly scoped there', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'web-code-utils-test-'));
  const workspaceRoot = path.join(tempRoot, 'root', 'web-code-workspaces', 'tester');
  const projectPath = path.join(workspaceRoot, 'demo-project');

  try {
    await mkdir(workspaceRoot, { recursive: true });

    const result = await validateWorkspacePath(projectPath, workspaceRoot);

    assert.equal(result.valid, true);
    assert.equal(result.resolvedPath, projectPath);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('validateWorkspacePath still blocks unrelated paths under /root when workspace root is elsewhere', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'web-code-utils-test-'));
  const workspaceRoot = path.join(tempRoot, 'workspace-root');
  const fakeRootPath = path.join(path.sep, 'root', 'web-code-workspaces', 'tester', 'demo-project');

  try {
    await mkdir(workspaceRoot, { recursive: true });

    const result = await validateWorkspacePath(fakeRootPath, workspaceRoot);

    assert.equal(result.valid, false);
    assert.equal(result.error, 'Cannot create workspace in system directory: /root');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
