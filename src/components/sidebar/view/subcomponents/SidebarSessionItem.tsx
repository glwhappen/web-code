import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { Check, Edit2, MoreHorizontal, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Badge, Button, Tooltip } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import { createSessionViewModel } from '../../utils/utils';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

type SidebarSessionItemProps = {
  project: Project;
  session: SessionWithProvider;
  selectedSession: ProjectSession | null;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  t: TFunction;
};

/**
 * Compact relative time for sidebar rows:
 * <1m, Xm, Xhr, Xd.
 */
const formatCompactSessionAge = (dateString: string, currentTime: Date): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffInMinutes = Math.floor(Math.max(0, currentTime.getTime() - date.getTime()) / (1000 * 60));
  if (diffInMinutes < 1) {
    return '<1m';
  }

  if (diffInMinutes < 60) {
    return `${diffInMinutes}m`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}hr`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d`;
};

type MenuPosition = {
  top: number;
  left: number;
};

const SESSION_ACTIONS_MENU_WIDTH = 168;

export default function SidebarSessionItem({
  project,
  session,
  selectedSession,
  currentTime,
  editingSession,
  editingSessionName,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  t,
}: SidebarSessionItemProps) {
  const sessionView = createSessionViewModel(session, currentTime, t);
  const isSelected = selectedSession?.id === session.id;
  const isEditing = editingSession === session.id;
  const compactSessionAge = formatCompactSessionAge(sessionView.sessionTime, currentTime);
  const isSessionBeingEdited = editingSession === session.id;
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const [sessionMenuPosition, setSessionMenuPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextTapRef = useRef(false);
  const showDesktopSessionActions = isSelected || isSessionBeingEdited || isSessionMenuOpen;

  // Sessions are owned by a project identified by `projectId` (DB primary key)
  // after the projectName → projectId migration.
  const selectMobileSession = () => {
    onProjectSelect(project);
    onSessionSelect(session, project.projectId);
  };

  const saveEditedSession = () => {
    onSaveEditingSession(project.projectId, session.id, editingSessionName, session.__provider);
  };

  const requestDeleteSession = () => {
    onDeleteSession(project.projectId, session.id, sessionView.sessionName, session.__provider);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openSessionActionsMenu = (clientX: number, clientY: number) => {
    const left = Math.max(8, Math.min(clientX, window.innerWidth - SESSION_ACTIONS_MENU_WIDTH - 8));
    const top = Math.max(8, Math.min(clientY, window.innerHeight - 120));
    setSessionMenuPosition({ top, left });
    setIsSessionMenuOpen(true);
  };

  const closeSessionActionsMenu = () => {
    setIsSessionMenuOpen(false);
  };

  const handleSessionContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onProjectSelect(project);
    onSessionSelect(session, project.projectId);
    openSessionActionsMenu(event.clientX, event.clientY);
  };

  const handleSessionTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    clearLongPressTimer();
    if (event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    longPressTimerRef.current = setTimeout(() => {
      suppressNextTapRef.current = true;
      openSessionActionsMenu(touch.clientX, touch.clientY);
    }, 450);
  };

  const handleSessionTouchEnd = () => {
    clearLongPressTimer();
  };

  useEffect(() => {
    if (!isSessionMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[data-session-actions-menu="${session.id}"]`)) {
        return;
      }
      closeSessionActionsMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSessionActionsMenu();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', closeSessionActionsMenu);
    window.addEventListener('scroll', closeSessionActionsMenu, true);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', closeSessionActionsMenu);
      window.removeEventListener('scroll', closeSessionActionsMenu, true);
    };
  }, [isSessionMenuOpen, session.id]);

  useEffect(() => () => clearLongPressTimer(), []);

  return (
    <div className="group relative">
      {sessionView.isActive && (
        <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 transform">
          <Tooltip content={t('tooltips.activeSessionIndicator')} position="right">
            <div
              role="status"
              aria-label={t('tooltips.activeSessionIndicator')}
              className="h-2 w-2 animate-pulse rounded-full bg-green-500"
            />
          </Tooltip>
        </div>
      )}

      <div className="md:hidden">
        <div
          className={cn(
            'p-2 mx-3 my-0.5 rounded-md bg-card border active:scale-[0.98] transition-all duration-150 relative',
            isSelected ? 'bg-primary/5 border-primary/20' : '',
            !isSelected && sessionView.isActive
              ? 'border-green-500/30 bg-green-50/5 dark:bg-green-900/5'
              : 'border-border/30',
          )}
          onClick={() => {
            if (suppressNextTapRef.current) {
              suppressNextTapRef.current = false;
              return;
            }
            selectMobileSession();
          }}
          onTouchStart={handleSessionTouchStart}
          onTouchEnd={handleSessionTouchEnd}
          onTouchCancel={handleSessionTouchEnd}
          onTouchMove={handleSessionTouchEnd}
          onContextMenu={handleSessionContextMenu}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0',
                isSelected ? 'bg-primary/10' : 'bg-muted/50',
              )}
            >
              <SessionProviderLogo provider={session.__provider} className="h-3 w-3" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-xs font-medium text-foreground">{sessionView.sessionName}</div>
                {compactSessionAge && (
                  <span className="ml-auto flex-shrink-0 text-[11px] text-muted-foreground">{compactSessionAge}</span>
                )}
              </div>
              <div className="mt-0.5 flex items-center">
                {sessionView.messageCount > 0 && (
                  <Badge variant="secondary" className="px-1 py-0 text-xs">
                    {sessionView.messageCount}
                  </Badge>
                )}
              </div>
            </div>

            <button
              className="ml-1 flex h-5 w-5 items-center justify-center rounded-md bg-muted/50 text-muted-foreground transition-transform active:scale-95"
              onClick={(event) => {
                event.stopPropagation();
                const target = event.currentTarget.getBoundingClientRect();
                openSessionActionsMenu(target.right - 8, target.bottom + 4);
              }}
              title={t('actions.more', 'More actions')}
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start p-2 pr-10 h-auto font-normal text-left hover:bg-accent/50 transition-colors duration-200',
            isSelected && 'bg-accent text-accent-foreground',
          )}
          onClick={() => onSessionSelect(session, project.projectId)}
          onContextMenu={handleSessionContextMenu}
        >
          <div className="flex w-full min-w-0 items-start gap-2">
            <SessionProviderLogo provider={session.__provider} className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-xs font-medium text-foreground">{sessionView.sessionName}</div>
                {compactSessionAge && (
                  <span
                    className={cn(
                      'ml-auto flex-shrink-0 text-[11px] text-muted-foreground transition-opacity duration-200',
                      showDesktopSessionActions ? 'opacity-0' : 'opacity-100',
                    )}
                  >
                    {compactSessionAge}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center">
                {sessionView.messageCount > 0 && <Badge variant="secondary" className="px-1 py-0 text-xs">{sessionView.messageCount}</Badge>}
              </div>
            </div>
          </div>
        </Button>

        <div
          className={cn(
            'absolute right-2 top-1/2 flex -translate-y-1/2 transform items-center gap-1 transition-all duration-200',
            showDesktopSessionActions ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
          )}
        >
            {isSessionBeingEdited ? (
              <>
                <input
                  type="text"
                  value={editingSessionName}
                  onChange={(event) => onEditingSessionNameChange(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      saveEditedSession();
                    } else if (event.key === 'Escape') {
                      onCancelEditingSession();
                    }
                  }}
                  onClick={(event) => event.stopPropagation()}
                  className="w-32 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <button
                  className="flex h-6 w-6 items-center justify-center rounded bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40"
                  onClick={(event) => {
                    event.stopPropagation();
                    saveEditedSession();
                  }}
                  title={t('tooltips.save')}
                >
                  <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                </button>
                <button
                  className="flex h-6 w-6 items-center justify-center rounded bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/20 dark:hover:bg-gray-900/40"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelEditingSession();
                  }}
                  title={t('tooltips.cancel')}
                >
                  <X className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                </button>
              </>
            ) : (
              <>
                <button
                  className="flex h-6 w-6 items-center justify-center rounded bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/20 dark:hover:bg-gray-900/40"
                  onClick={(event) => {
                    event.stopPropagation();
                    const target = event.currentTarget.getBoundingClientRect();
                    openSessionActionsMenu(target.right - 8, target.bottom + 4);
                  }}
                  title={t('actions.more', 'More actions')}
                >
                  <MoreHorizontal className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                </button>
              </>
            )}
          </div>
      </div>

      {isSessionMenuOpen && !isSessionBeingEdited && (
        <div
          data-session-actions-menu={session.id}
          className="fixed z-[70] w-44 rounded-md border border-border bg-popover p-1 shadow-lg"
          style={{ top: `${sessionMenuPosition.top}px`, left: `${sessionMenuPosition.left}px` }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
            onClick={() => {
              closeSessionActionsMenu();
              onStartEditingSession(session.id, sessionView.sessionName);
            }}
          >
            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
            {t('sessions.renameSession')}
          </button>
          {!sessionView.isCursorSession && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              onClick={() => {
                closeSessionActionsMenu();
                requestDeleteSession();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('sessions.deleteSession')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
