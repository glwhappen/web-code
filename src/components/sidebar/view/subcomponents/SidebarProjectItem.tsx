import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { Check, ChevronDown, ChevronRight, Edit3, Folder, FolderOpen, MoreHorizontal, Star, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { MCPServerStatus, SessionWithProvider } from '../../types/types';
import { getTaskIndicatorStatus } from '../../utils/utils';

import TaskIndicator from './TaskIndicator';
import SidebarProjectSessions from './SidebarProjectSessions';

type SidebarProjectItemProps = {
  project: Project;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  isExpanded: boolean;
  isDeleting: boolean;
  isStarred: boolean;
  editingProject: string | null;
  editingName: string;
  sessions: SessionWithProvider[];
  initialSessionsLoaded: boolean;
  isLoadingMoreSessions: boolean;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  tasksEnabled: boolean;
  mcpServerStatus: MCPServerStatus;
  onEditingNameChange: (name: string) => void;
  onToggleProject: (projectName: string) => void;
  onProjectSelect: (project: Project) => void;
  onToggleStarProject: (projectName: string) => void;
  onStartEditingProject: (project: Project) => void;
  onCancelEditingProject: () => void;
  onSaveProjectName: (projectName: string) => void;
  onDeleteProject: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  onLoadMoreSessions: (projectId: string) => void;
  onNewSession: (project: Project) => void;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  t: TFunction;
};

const getSessionCountDisplay = (project: Project, sessions: SessionWithProvider[]): string => {
  const total = Number(project.sessionMeta?.total ?? sessions.length);
  return String(total);
};

type MenuPosition = {
  top: number;
  left: number;
};

const PROJECT_ACTIONS_MENU_WIDTH = 176;

export default function SidebarProjectItem({
  project,
  selectedProject,
  selectedSession,
  isExpanded,
  isDeleting,
  isStarred,
  editingProject,
  editingName,
  sessions,
  initialSessionsLoaded,
  isLoadingMoreSessions,
  currentTime,
  editingSession,
  editingSessionName,
  tasksEnabled,
  mcpServerStatus,
  onEditingNameChange,
  onToggleProject,
  onProjectSelect,
  onToggleStarProject,
  onStartEditingProject,
  onCancelEditingProject,
  onSaveProjectName,
  onDeleteProject,
  onSessionSelect,
  onDeleteSession,
  onLoadMoreSessions,
  onNewSession,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  t,
}: SidebarProjectItemProps) {
  // Project identity is tracked by the DB-assigned `projectId` everywhere
  // after the projectName → projectId migration.
  const isSelected = selectedProject?.projectId === project.projectId;
  const isEditing = editingProject === project.projectId;
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [projectMenuPosition, setProjectMenuPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextTapRef = useRef(false);
  const showDesktopProjectActions = isSelected || isProjectMenuOpen;
  const totalSessionCount = Number(project.sessionMeta?.total ?? sessions.length);
  const sessionCountDisplay = getSessionCountDisplay(project, sessions);
  const sessionCountLabel = `${sessionCountDisplay} session${totalSessionCount === 1 ? '' : 's'}`;
  const taskStatus = getTaskIndicatorStatus(project, mcpServerStatus);

  const toggleProject = () => onToggleProject(project.projectId);
  const toggleStarProject = () => onToggleStarProject(project.projectId);

  const saveProjectName = () => {
    onSaveProjectName(project.projectId);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openProjectActionsMenu = (clientX: number, clientY: number) => {
    const left = Math.max(8, Math.min(clientX, window.innerWidth - PROJECT_ACTIONS_MENU_WIDTH - 8));
    const top = Math.max(8, Math.min(clientY, window.innerHeight - 140));
    setProjectMenuPosition({ top, left });
    setIsProjectMenuOpen(true);
  };

  const closeProjectActionsMenu = () => {
    setIsProjectMenuOpen(false);
  };

  const selectAndToggleProject = () => {
    if (selectedProject?.projectId !== project.projectId) {
      onProjectSelect(project);
    }

    toggleProject();
  };

  const handleProjectContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onProjectSelect(project);
    openProjectActionsMenu(event.clientX, event.clientY);
  };

  const handleProjectTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    clearLongPressTimer();
    if (event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    longPressTimerRef.current = setTimeout(() => {
      suppressNextTapRef.current = true;
      onProjectSelect(project);
      openProjectActionsMenu(touch.clientX, touch.clientY);
    }, 450);
  };

  const handleProjectTouchEnd = () => {
    clearLongPressTimer();
  };

  useEffect(() => {
    if (!isProjectMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[data-project-actions-menu="${project.projectId}"]`)) {
        return;
      }
      closeProjectActionsMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeProjectActionsMenu();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', closeProjectActionsMenu);
    window.addEventListener('scroll', closeProjectActionsMenu, true);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', closeProjectActionsMenu);
      window.removeEventListener('scroll', closeProjectActionsMenu, true);
    };
  }, [isProjectMenuOpen, project.projectId]);

  useEffect(() => () => clearLongPressTimer(), []);

  return (
    <div className={cn('md:space-y-1', isDeleting && 'opacity-50 pointer-events-none')}>
      <div className="md:group group">
        <div className="md:hidden">
          <div
            className={cn(
              'p-3 mx-3 my-1 rounded-lg bg-card border border-border/50 active:scale-[0.98] transition-all duration-150',
              isSelected && 'bg-primary/5 border-primary/20',
              isStarred &&
                !isSelected &&
                'bg-yellow-50/50 dark:bg-yellow-900/5 border-yellow-200/30 dark:border-yellow-800/30',
            )}
            onClick={() => {
              if (suppressNextTapRef.current) {
                suppressNextTapRef.current = false;
                return;
              }
              toggleProject();
            }}
            onTouchStart={handleProjectTouchStart}
            onTouchEnd={handleProjectTouchEnd}
            onTouchCancel={handleProjectTouchEnd}
            onTouchMove={handleProjectTouchEnd}
            onContextMenu={handleProjectContextMenu}
          >
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                    isExpanded ? 'bg-primary/10' : 'bg-muted',
                  )}
                >
                  {isExpanded ? (
                    <FolderOpen className="h-4 w-4 text-primary" />
                  ) : (
                    <Folder className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(event) => onEditingNameChange(event.target.value)}
                      className="w-full rounded-lg border-2 border-primary/40 bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-all duration-200 focus:border-primary focus:shadow-md focus:outline-none"
                      placeholder={t('projects.projectNamePlaceholder')}
                      autoFocus
                      autoComplete="off"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          saveProjectName();
                        }

                        if (event.key === 'Escape') {
                          onCancelEditingProject();
                        }
                      }}
                      style={{
                        fontSize: '16px',
                        WebkitAppearance: 'none',
                        borderRadius: '8px',
                      }}
                    />
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 items-center justify-between">
                        <h3 className="truncate text-sm font-medium text-foreground">{project.displayName}</h3>
                        {tasksEnabled && (
                          <TaskIndicator
                            status={taskStatus}
                            size="xs"
                            className="ml-2 hidden flex-shrink-0 md:inline-flex"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{sessionCountLabel}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500 shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-green-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveProjectName();
                      }}
                    >
                      <Check className="h-4 w-4 text-white" />
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-500 shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-gray-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCancelEditingProject();
                      }}
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </>
                ) : (
                  <>
                    {isStarred && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400">
                        <Star className="h-3 w-3 fill-current" />
                      </div>
                    )}

                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-muted/50 active:scale-90"
                      onClick={(event) => {
                        event.stopPropagation();
                        onProjectSelect(project);
                        const target = event.currentTarget.getBoundingClientRect();
                        openProjectActionsMenu(target.right - 8, target.bottom + 4);
                      }}
                      title={t('actions.more', 'More actions')}
                    >
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>

                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/30">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          className={cn(
            'hidden md:flex w-full justify-between p-2 h-auto font-normal hover:bg-accent/50',
            isSelected && 'bg-accent text-accent-foreground',
            isStarred &&
              !isSelected &&
              'bg-yellow-50/50 dark:bg-yellow-900/10 hover:bg-yellow-100/50 dark:hover:bg-yellow-900/20',
          )}
          onClick={selectAndToggleProject}
          onContextMenu={handleProjectContextMenu}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-primary" />
            ) : (
              <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1 text-left">
              {isEditing ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(event) => onEditingNameChange(event.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:ring-2 focus:ring-primary/20"
                    placeholder={t('projects.projectNamePlaceholder')}
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        saveProjectName();
                      }
                      if (event.key === 'Escape') {
                        onCancelEditingProject();
                      }
                    }}
                  />
                  <div className="truncate text-xs text-muted-foreground" title={project.fullPath}>
                    {project.fullPath}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="truncate text-sm font-semibold text-foreground" title={project.displayName}>
                    {project.displayName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {sessionCountDisplay}
                    {project.fullPath !== project.displayName && (
                      <span className="ml-1 opacity-60" title={project.fullPath}>
                        {' - '}
                        {project.fullPath.length > 25 ? `...${project.fullPath.slice(-22)}` : project.fullPath}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            {isEditing ? (
              <>
                <div
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-green-600 transition-colors hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900/20"
                  onClick={(event) => {
                    event.stopPropagation();
                    saveProjectName();
                  }}
                >
                  <Check className="h-3 w-3" />
                </div>
                <div
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelEditingProject();
                  }}
                >
                  <X className="h-3 w-3" />
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={cn(
                    'touch:opacity-100 flex h-6 w-6 items-center justify-center rounded transition-all duration-200 hover:bg-accent',
                    showDesktopProjectActions
                      ? 'opacity-100 pointer-events-auto'
                      : 'opacity-0 pointer-events-none',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    const target = event.currentTarget.getBoundingClientRect();
                    openProjectActionsMenu(target.right - 8, target.bottom + 4);
                  }}
                  title={t('actions.more', 'More actions')}
                >
                  <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
                </button>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                )}
              </>
            )}
          </div>
        </Button>
      </div>

      {isProjectMenuOpen && !isEditing && (
        <div
          data-project-actions-menu={project.projectId}
          className="fixed z-[70] w-44 rounded-md border border-border bg-popover p-1 shadow-lg"
          style={{ top: `${projectMenuPosition.top}px`, left: `${projectMenuPosition.left}px` }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
            onClick={() => {
              closeProjectActionsMenu();
              toggleStarProject();
            }}
          >
            <Star className={cn('h-3.5 w-3.5', isStarred ? 'fill-current text-yellow-500' : 'text-muted-foreground')} />
            {isStarred ? t('tooltips.removeFromFavorites') : t('tooltips.addToFavorites')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
            onClick={() => {
              closeProjectActionsMenu();
              onStartEditingProject(project);
            }}
          >
            <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
            {t('projects.renameProject')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            onClick={() => {
              closeProjectActionsMenu();
              onDeleteProject(project);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('projects.deleteProject')}
          </button>
        </div>
      )}

      <SidebarProjectSessions
        project={project}
        isExpanded={isExpanded}
        sessions={sessions}
        selectedSession={selectedSession}
        initialSessionsLoaded={initialSessionsLoaded}
        hasMoreSessions={Boolean(project.sessionMeta?.hasMore)}
        isLoadingMoreSessions={isLoadingMoreSessions}
        currentTime={currentTime}
        editingSession={editingSession}
        editingSessionName={editingSessionName}
        onEditingSessionNameChange={onEditingSessionNameChange}
        onStartEditingSession={onStartEditingSession}
        onCancelEditingSession={onCancelEditingSession}
        onSaveEditingSession={onSaveEditingSession}
        onProjectSelect={onProjectSelect}
        onSessionSelect={onSessionSelect}
        onDeleteSession={onDeleteSession}
        onLoadMoreSessions={onLoadMoreSessions}
        onNewSession={onNewSession}
        t={t}
      />
    </div>
  );
}
