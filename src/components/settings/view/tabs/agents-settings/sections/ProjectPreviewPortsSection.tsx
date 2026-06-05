import { Check, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../../../../../../utils/api';
import { Button, Input } from '../../../../../../shared/view/ui';
import SettingsCard from '../../../SettingsCard';
import SettingsSection from '../../../SettingsSection';
import type { SettingsProject } from '../../../../../sidebar/types/types';

type ProjectDraft = {
  previewProdPort: string;
  previewDevPort: string;
};

type SaveState = {
  kind: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
};

type ProjectPreviewPortsSectionProps = {
  projects: SettingsProject[];
};

const normalizePortInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return Number.NaN;
  }

  return parsed;
};

export default function ProjectPreviewPortsSection({ projects }: ProjectPreviewPortsSectionProps) {
  const { t } = useTranslation('settings');
  const [drafts, setDrafts] = useState<Record<string, ProjectDraft>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  useEffect(() => {
    const nextDrafts: Record<string, ProjectDraft> = {};
    for (const project of projects) {
      nextDrafts[project.name] = {
        previewProdPort: typeof project.previewProdPort === 'number' ? String(project.previewProdPort) : '',
        previewDevPort: typeof project.previewDevPort === 'number' ? String(project.previewDevPort) : '',
      };
    }
    setDrafts(nextDrafts);
  }, [projects]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)),
    [projects],
  );

  const updateDraft = (projectId: string, key: keyof ProjectDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [projectId]: {
        previewProdPort: prev[projectId]?.previewProdPort ?? '',
        previewDevPort: prev[projectId]?.previewDevPort ?? '',
        [key]: value,
      },
    }));
  };

  const saveProjectPorts = async (project: SettingsProject) => {
    const draft = drafts[project.name] ?? { previewProdPort: '', previewDevPort: '' };
    const previewProdPort = normalizePortInput(draft.previewProdPort);
    const previewDevPort = normalizePortInput(draft.previewDevPort);

    if (Number.isNaN(previewProdPort) || Number.isNaN(previewDevPort)) {
      setSaveStates((prev) => ({
        ...prev,
        [project.name]: {
          kind: 'error',
          message: t('projectPreviewPorts.validation.invalidPort'),
        },
      }));
      return;
    }

    setSaveStates((prev) => ({
      ...prev,
      [project.name]: { kind: 'saving' },
    }));

    try {
      const response = await api.updateProjectPreviewPorts(project.name, previewProdPort, previewDevPort);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSaveStates((prev) => ({
        ...prev,
        [project.name]: {
          kind: 'saved',
          message: t('projectPreviewPorts.status.saved'),
        },
      }));

      window.dispatchEvent(new Event('projects-refresh-request'));
    } catch (error) {
      setSaveStates((prev) => ({
        ...prev,
        [project.name]: {
          kind: 'error',
          message: error instanceof Error ? error.message : t('projectPreviewPorts.status.error'),
        },
      }));
    }
  };

  if (sortedProjects.length === 0) {
    return (
      <SettingsSection
        title={t('projectPreviewPorts.title')}
        description={t('projectPreviewPorts.description')}
      >
        <SettingsCard className="p-4">
          <p className="text-sm text-muted-foreground">{t('projectPreviewPorts.emptyState')}</p>
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title={t('projectPreviewPorts.title')}
      description={t('projectPreviewPorts.description')}
    >
      <SettingsCard divided>
        {sortedProjects.map((project) => {
          const draft = drafts[project.name] ?? { previewProdPort: '', previewDevPort: '' };
          const saveState = saveStates[project.name] ?? { kind: 'idle' as const };

          return (
            <div key={project.name} className="space-y-4 px-4 py-4">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-foreground">
                  {project.displayName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {project.fullPath || project.path || project.name}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor={`preview-prod-${project.name}`} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('projectPreviewPorts.prodPort')}
                  </label>
                  <Input
                    id={`preview-prod-${project.name}`}
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.previewProdPort}
                    onChange={(event) => updateDraft(project.name, 'previewProdPort', event.target.value)}
                    placeholder={t('projectPreviewPorts.portPlaceholder')}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('projectPreviewPorts.prodHint')}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={`preview-dev-${project.name}`} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('projectPreviewPorts.devPort')}
                  </label>
                  <Input
                    id={`preview-dev-${project.name}`}
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.previewDevPort}
                    onChange={(event) => updateDraft(project.name, 'previewDevPort', event.target.value)}
                    placeholder={t('projectPreviewPorts.portPlaceholder')}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('projectPreviewPorts.devHint')}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={() => void saveProjectPorts(project)}
                  disabled={saveState.kind === 'saving'}
                >
                  {saveState.kind === 'saving' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  {saveState.kind === 'saving'
                    ? t('projectPreviewPorts.actions.saving')
                    : t('projectPreviewPorts.actions.save')}
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
