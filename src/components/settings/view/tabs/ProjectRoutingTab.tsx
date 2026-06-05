import { Check, Globe, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { normalizeProjectHostLabel, projectDisplayNameToHostLabel } from '../../../../../shared/projectHosts.js';
import { Button, Input } from '../../../../shared/view/ui';
import { api } from '../../../../utils/api';
import SettingsCard from '../SettingsCard';
import SettingsSection from '../SettingsSection';
import type { SettingsProject } from '../../../sidebar/types/types';

type ProjectRoutingDraft = {
  projectHostAlias: string;
  previewProdPort: string;
  previewDevPort: string;
};

type SaveState = {
  kind: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
};

type ProjectRoutingTabProps = {
  projects: SettingsProject[];
};

function normalizePortInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return Number.NaN;
  }

  return parsed;
}

function normalizeHostAliasInput(value: string): string | null {
  const normalized = normalizeProjectHostLabel(value);
  return normalized.length > 0 ? normalized : null;
}

function resolveProjectHostLabel(project: SettingsProject, projectHostAlias?: string | null): string {
  const normalizedAlias = normalizeHostAliasInput(projectHostAlias ?? '');
  if (normalizedAlias) {
    return normalizedAlias;
  }

  const fallbackPath = project.fullPath || project.path || project.name;
  return projectDisplayNameToHostLabel(project.displayName || project.name, fallbackPath);
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const payload = await response.json() as {
      error?: { message?: string; details?: unknown };
      message?: string;
    };

    if (typeof payload?.error?.details === 'string' && payload.error.details.trim().length > 0) {
      return payload.error.details;
    }

    if (typeof payload?.error?.message === 'string' && payload.error.message.trim().length > 0) {
      return payload.error.message;
    }

    if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
      return payload.message;
    }
  } catch {
    // Ignore JSON parsing failures and fall back to a generic error.
  }

  return fallbackMessage;
}

export default function ProjectRoutingTab({ projects }: ProjectRoutingTabProps) {
  const { t } = useTranslation('settings');
  const [drafts, setDrafts] = useState<Record<string, ProjectRoutingDraft>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  useEffect(() => {
    const nextDrafts: Record<string, ProjectRoutingDraft> = {};
    for (const project of projects) {
      nextDrafts[project.name] = {
        projectHostAlias: typeof project.projectHostAlias === 'string' ? project.projectHostAlias : '',
        previewProdPort: typeof project.previewProdPort === 'number' ? String(project.previewProdPort) : '',
        previewDevPort: typeof project.previewDevPort === 'number' ? String(project.previewDevPort) : '',
      };
    }
    setDrafts(nextDrafts);
    setSaveStates({});
  }, [projects]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)),
    [projects],
  );

  const updateDraft = (projectId: string, key: keyof ProjectRoutingDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [projectId]: {
        projectHostAlias: prev[projectId]?.projectHostAlias ?? '',
        previewProdPort: prev[projectId]?.previewProdPort ?? '',
        previewDevPort: prev[projectId]?.previewDevPort ?? '',
        [key]: value,
      },
    }));
  };

  const getDraft = (project: SettingsProject): ProjectRoutingDraft => (
    drafts[project.name] ?? {
      projectHostAlias: typeof project.projectHostAlias === 'string' ? project.projectHostAlias : '',
      previewProdPort: typeof project.previewProdPort === 'number' ? String(project.previewProdPort) : '',
      previewDevPort: typeof project.previewDevPort === 'number' ? String(project.previewDevPort) : '',
    }
  );

  const validateProjectDraft = (project: SettingsProject): string | null => {
    const draft = getDraft(project);
    const normalizedHostAlias = normalizeHostAliasInput(draft.projectHostAlias);
    const previewProdPort = normalizePortInput(draft.previewProdPort);
    const previewDevPort = normalizePortInput(draft.previewDevPort);

    if (draft.projectHostAlias.trim() && !normalizedHostAlias) {
      return t('projectRouting.validation.invalidAlias');
    }

    if (Number.isNaN(previewProdPort) || Number.isNaN(previewDevPort)) {
      return t('projectRouting.validation.invalidPort');
    }

    if (previewProdPort !== null && previewDevPort !== null && previewProdPort === previewDevPort) {
      return t('projectRouting.validation.samePorts');
    }

    const desiredLabel = resolveProjectHostLabel(project, normalizedHostAlias);
    for (const otherProject of sortedProjects) {
      if (otherProject.name === project.name) {
        continue;
      }

      const otherDraft = getDraft(otherProject);
      const otherLabel = resolveProjectHostLabel(
        otherProject,
        normalizeHostAliasInput(otherDraft.projectHostAlias),
      );
      if (otherLabel === desiredLabel) {
        return t('projectRouting.validation.duplicateDomain', {
          project: otherProject.displayName || otherProject.name,
        });
      }

      const otherProdPort = normalizePortInput(otherDraft.previewProdPort);
      const otherDevPort = normalizePortInput(otherDraft.previewDevPort);
      if (previewProdPort !== null && previewProdPort === otherProdPort) {
        return t('projectRouting.validation.duplicatePort', {
          port: previewProdPort,
          project: otherProject.displayName || otherProject.name,
        });
      }
      if (previewProdPort !== null && previewProdPort === otherDevPort) {
        return t('projectRouting.validation.duplicatePort', {
          port: previewProdPort,
          project: otherProject.displayName || otherProject.name,
        });
      }
      if (previewDevPort !== null && previewDevPort === otherProdPort) {
        return t('projectRouting.validation.duplicatePort', {
          port: previewDevPort,
          project: otherProject.displayName || otherProject.name,
        });
      }
      if (previewDevPort !== null && previewDevPort === otherDevPort) {
        return t('projectRouting.validation.duplicatePort', {
          port: previewDevPort,
          project: otherProject.displayName || otherProject.name,
        });
      }
    }

    return null;
  };

  const saveProjectRouting = async (project: SettingsProject) => {
    const validationMessage = validateProjectDraft(project);
    if (validationMessage) {
      setSaveStates((prev) => ({
        ...prev,
        [project.name]: {
          kind: 'error',
          message: validationMessage,
        },
      }));
      return;
    }

    const draft = getDraft(project);
    const projectHostAlias = normalizeHostAliasInput(draft.projectHostAlias);
    const previewProdPort = normalizePortInput(draft.previewProdPort);
    const previewDevPort = normalizePortInput(draft.previewDevPort);

    setSaveStates((prev) => ({
      ...prev,
      [project.name]: { kind: 'saving' },
    }));

    try {
      const response = await api.updateProjectRouting(project.name, projectHostAlias, previewProdPort, previewDevPort);
      if (!response.ok) {
        const errorMessage = await readErrorMessage(response, t('projectRouting.status.error'));
        throw new Error(errorMessage);
      }

      setSaveStates((prev) => ({
        ...prev,
        [project.name]: {
          kind: 'saved',
          message: t('projectRouting.status.saved'),
        },
      }));

      window.dispatchEvent(new Event('projects-refresh-request'));
    } catch (error) {
      setSaveStates((prev) => ({
        ...prev,
        [project.name]: {
          kind: 'error',
          message: error instanceof Error ? error.message : t('projectRouting.status.error'),
        },
      }));
    }
  };

  if (sortedProjects.length === 0) {
    return (
      <SettingsSection
        title={t('projectRouting.title')}
        description={t('projectRouting.description')}
      >
        <SettingsCard className="p-4">
          <p className="text-sm text-muted-foreground">{t('projectRouting.emptyState')}</p>
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title={t('projectRouting.title')}
      description={t('projectRouting.description')}
    >
      <SettingsCard divided>
        {sortedProjects.map((project) => {
          const draft = getDraft(project);
          const saveState = saveStates[project.name] ?? { kind: 'idle' as const };
          const effectiveHostLabel = resolveProjectHostLabel(project, draft.projectHostAlias);

          return (
            <div key={project.name} className="space-y-4 px-4 py-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {project.displayName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {project.fullPath || project.path || project.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('projectRouting.hostnamePreview', { host: `${effectiveHostLabel}.code.glwsq.cn` })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`host-alias-${project.name}`} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('projectRouting.hostAlias')}
                </label>
                <Input
                  id={`host-alias-${project.name}`}
                  value={draft.projectHostAlias}
                  onChange={(event) => updateDraft(project.name, 'projectHostAlias', event.target.value)}
                  placeholder={t('projectRouting.hostAliasPlaceholder')}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('projectRouting.hostAliasHint')}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor={`preview-prod-${project.name}`} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('projectRouting.prodPort')}
                  </label>
                  <Input
                    id={`preview-prod-${project.name}`}
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.previewProdPort}
                    onChange={(event) => updateDraft(project.name, 'previewProdPort', event.target.value)}
                    placeholder={t('projectRouting.portPlaceholder')}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('projectRouting.prodHint')}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={`preview-dev-${project.name}`} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('projectRouting.devPort')}
                  </label>
                  <Input
                    id={`preview-dev-${project.name}`}
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.previewDevPort}
                    onChange={(event) => updateDraft(project.name, 'previewDevPort', event.target.value)}
                    placeholder={t('projectRouting.portPlaceholder')}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('projectRouting.devHint')}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={() => void saveProjectRouting(project)}
                  disabled={saveState.kind === 'saving'}
                >
                  {saveState.kind === 'saving' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  {saveState.kind === 'saving'
                    ? t('projectRouting.actions.saving')
                    : t('projectRouting.actions.save')}
                </Button>

                {saveState.kind === 'saved' && saveState.message && (
                  <span className="text-sm text-green-600 dark:text-green-400">
                    {saveState.message}
                  </span>
                )}

                {saveState.kind === 'error' && saveState.message && (
                  <span className="text-sm text-red-600 dark:text-red-400">
                    {saveState.message}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </SettingsCard>
    </SettingsSection>
  );
}
