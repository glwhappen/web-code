# Repository Maintenance

## Fork Identity

- This repository is the `glwhappen/web-code` fork of
  `siteboon/claudecodeui`.
- The published npm package is `@glwhappen/web-code`.
- Fork-owned commits must use `glwhappen <1597721684@qq.com>`.
- Do not rewrite published history solely to change author metadata.

## Versioning

- The fork uses its own semantic version independently from upstream.
- Start the independent fork release line at `2.0.0`.
- Use normal semantic versioning for fork releases:
  - Patch releases contain compatible fixes.
  - Minor releases contain compatible features.
  - Major releases may contain breaking changes.
- Record the upstream base separately in `package.json` as
  `"upstreamVersion"`.
- When syncing upstream, update `upstreamVersion` to the upstream version that
  was merged.
- Do not copy the upstream package version into the fork's `version` field.
- Keep version-only changes in a dedicated release commit.

## Upstream Sync

1. Fetch `upstream` and inspect new commits before merging.
2. Create and push a backup branch or tag for the current `main`.
3. Merge `upstream/main` into the fork branch without rewriting published
   history.
4. Preserve the fork's multi-user isolation, admin controls, browser panel,
   project routing, queued messages, and user-scoped workspace behavior.
5. Update `upstreamVersion` without changing the fork version unless a fork
   release is being prepared.
6. Run type checking, lint, and relevant tests.
7. Push the integration branch before updating `main`.

## Git Safety

- Prefer normal merges for future upstream synchronization.
- Do not use `filter-branch`, `filter-repo`, or broad rebases on published
  branches.
- Do not force-push `main` unless a remote backup exists and the user explicitly
  approves the history replacement.
- Keep backup branches and recovery tags until the replacement has been
  verified.
