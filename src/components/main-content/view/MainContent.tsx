import React, { useCallback, useEffect, useRef, useState } from 'react';

import ChatInterface from '../../chat/view/ChatInterface';
import FileTree from '../../file-tree/view/FileTree';
import StandaloneShell from '../../standalone-shell/view/StandaloneShell';
import GitPanel from '../../git-panel/view/GitPanel';
import PluginTabContent from '../../plugins/view/PluginTabContent';
import BrowserPanel from '../../browser-panel/view/BrowserPanel';
import type { MainContentProps } from '../types/types';
import { useTaskMaster } from '../../../contexts/TaskMasterContext';
import { usePaletteOpsRegister } from '../../../contexts/PaletteOpsContext';
import { useTasksSettings } from '../../../contexts/TasksSettingsContext';
import { useUiPreferences } from '../../../hooks/useUiPreferences';
import { useEditorSidebar } from '../../code-editor/hooks/useEditorSidebar';
import EditorSidebar from '../../code-editor/view/EditorSidebar';
import type { Project } from '../../../types/app';
import { TaskMasterPanel } from '../../task-master';
import { cn } from '../../../lib/utils';

import MainContentHeader from './subcomponents/MainContentHeader';
import MainContentStateView from './subcomponents/MainContentStateView';
import ErrorBoundary from './ErrorBoundary';

const BROWSER_DOCK_WIDTH_STORAGE_KEY = 'browserDockWidth';
const DEFAULT_BROWSER_DOCK_WIDTH = 480;
const MIN_BROWSER_DOCK_WIDTH = 320;

type TaskMasterContextValue = {
  currentProject?: Project | null;
  setCurrentProject?: ((project: Project) => void) | null;
};

type TasksSettingsContextValue = {
  tasksEnabled: boolean;
  isTaskMasterInstalled: boolean | null;
  isTaskMasterReady: boolean | null;
};

function MainContent({
  selectedProject,
  selectedSession,
  activeTab,
  setActiveTab,
  ws,
  sendMessage,
  latestMessage,
  messageEvents,
  isMobile,
  onMenuClick,
  isLoading,
  onInputFocusChange,
  onSessionActive,
  onSessionInactive,
  onSessionProcessing,
  onSessionNotProcessing,
  processingSessions,
  onNavigateToSession,
  onShowSettings,
  externalMessageUpdate,
  newSessionTrigger,
}: MainContentProps) {
  const { preferences } = useUiPreferences();
  const { autoExpandTools, showRawParameters, showThinking, autoScrollToBottom, sendByCtrlEnter, dockBrowserToChat } = preferences;
  const [browserDockWidth, setBrowserDockWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_BROWSER_DOCK_WIDTH;
    }

    const raw = window.localStorage.getItem(BROWSER_DOCK_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_BROWSER_DOCK_WIDTH;
  });
  const [isResizingBrowserDock, setIsResizingBrowserDock] = useState(false);
  const mainContentBodyRef = useRef<HTMLDivElement | null>(null);

  const { currentProject, setCurrentProject } = useTaskMaster() as TaskMasterContextValue;
  const { tasksEnabled, isTaskMasterInstalled } = useTasksSettings() as TasksSettingsContextValue;

  const shouldShowTasksTab = Boolean(tasksEnabled && isTaskMasterInstalled);

  const {
    editingFile,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    resizeHandleRef,
    handleFileOpen,
    handleCloseEditor,
    handleToggleEditorExpand,
    handleResizeStart,
  } = useEditorSidebar({
    selectedProject,
    isMobile,
  });

  useEffect(() => {
    // Identify projects by DB `projectId`; the TaskMaster context uses the
    // same identifier to key its internal maps.
    const selectedProjectId = selectedProject?.projectId;
    const currentProjectId = currentProject?.projectId;

    if (selectedProject && selectedProjectId !== currentProjectId) {
      setCurrentProject?.(selectedProject);
    }
  }, [selectedProject, currentProject?.projectId, setCurrentProject]);

  useEffect(() => {
    if (!shouldShowTasksTab && activeTab === 'tasks') {
      setActiveTab('chat');
    }
  }, [shouldShowTasksTab, activeTab, setActiveTab]);

  usePaletteOpsRegister({
    openFile: (filePath: string) => {
      setActiveTab('files');
      handleFileOpen(filePath);
    },
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(BROWSER_DOCK_WIDTH_STORAGE_KEY, String(browserDockWidth));
  }, [browserDockWidth]);

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!isResizingBrowserDock) {
        return;
      }

      const containerRect = mainContentBodyRef.current?.getBoundingClientRect();
      if (!containerRect) {
        return;
      }

      const maxWidth = Math.max(MIN_BROWSER_DOCK_WIDTH, Math.floor(containerRect.width * 0.7));
      const nextWidth = containerRect.right - event.clientX;
      const clampedWidth = Math.min(maxWidth, Math.max(MIN_BROWSER_DOCK_WIDTH, nextWidth));
      setBrowserDockWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizingBrowserDock(false);
    };

    if (isResizingBrowserDock) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingBrowserDock]);

  const handleBrowserDockResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) {
      return;
    }

    event.preventDefault();
    setIsResizingBrowserDock(true);
  }, [isMobile]);

  if (isLoading) {
    return <MainContentStateView mode="loading" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  if (!selectedProject) {
    return <MainContentStateView mode="empty" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  const showDockedBrowser = !isMobile && dockBrowserToChat && activeTab === 'chat';
  const showFullscreenBrowser = activeTab === 'browser';

  return (
    <div className="flex h-full flex-col">
      <MainContentHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedProject={selectedProject}
        selectedSession={selectedSession}
        shouldShowTasksTab={shouldShowTasksTab}
        isMobile={isMobile}
        onMenuClick={onMenuClick}
      />

      <div ref={mainContentBodyRef} className="flex min-h-0 flex-1 overflow-hidden">
        <div className={`flex min-h-0 min-w-[200px] overflow-hidden ${editorExpanded ? 'hidden' : ''} flex-1`}>
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
              showFullscreenBrowser && 'hidden',
            )}
          >
            <div className={`h-full ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
              <ErrorBoundary showDetails>
                <ChatInterface
                  selectedProject={selectedProject}
                  selectedSession={selectedSession}
                  ws={ws}
                  sendMessage={sendMessage}
                  latestMessage={latestMessage}
                  messageEvents={messageEvents}
                  onFileOpen={handleFileOpen}
                  onInputFocusChange={onInputFocusChange}
                  onSessionActive={onSessionActive}
                  onSessionInactive={onSessionInactive}
                  onSessionProcessing={onSessionProcessing}
                  onSessionNotProcessing={onSessionNotProcessing}
                  processingSessions={processingSessions}
                  onNavigateToSession={onNavigateToSession}
                  onShowSettings={onShowSettings}
                  autoExpandTools={autoExpandTools}
                  showRawParameters={showRawParameters}
                  showThinking={showThinking}
                  autoScrollToBottom={autoScrollToBottom}
                  sendByCtrlEnter={sendByCtrlEnter}
                  externalMessageUpdate={externalMessageUpdate}
                  newSessionTrigger={newSessionTrigger}
                  onShowAllTasks={tasksEnabled ? () => setActiveTab('tasks') : null}
                />
              </ErrorBoundary>
            </div>

            {activeTab === 'files' && (
              <div className="h-full overflow-hidden">
                <FileTree selectedProject={selectedProject} onFileOpen={handleFileOpen} />
              </div>
            )}

            {activeTab === 'shell' && (
              <div className="h-full w-full overflow-hidden">
                <StandaloneShell
                  project={selectedProject}
                  session={selectedSession}
                  showHeader={false}
                  isActive={activeTab === 'shell'}
                />
              </div>
            )}

            {activeTab === 'git' && (
              <div className="h-full overflow-hidden">
                <GitPanel selectedProject={selectedProject} isMobile={isMobile} onFileOpen={handleFileOpen} />
              </div>
            )}

            {shouldShowTasksTab && <TaskMasterPanel isVisible={activeTab === 'tasks'} />}

            <div className={`h-full overflow-hidden ${activeTab === 'preview' ? 'block' : 'hidden'}`} />

            {activeTab.startsWith('plugin:') && (
              <div className="h-full overflow-hidden">
                <PluginTabContent
                  pluginName={activeTab.replace('plugin:', '')}
                  selectedProject={selectedProject}
                  selectedSession={selectedSession}
                />
              </div>
            )}
          </div>

          <div
            className={cn(
              'relative min-h-0 shrink-0 overflow-hidden bg-background transition-[width] duration-200 ease-out',
              showFullscreenBrowser
                ? 'w-full flex-1'
                : showDockedBrowser
                  ? 'border-l border-border/70'
                  : 'hidden w-0',
            )}
            style={showDockedBrowser ? { width: `${browserDockWidth}px` } : undefined}
          >
            {showDockedBrowser && (
              <div
                className="absolute inset-y-0 left-0 z-10 flex w-2 -translate-x-1/2 cursor-col-resize items-center justify-center"
                onMouseDown={handleBrowserDockResizeStart}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize browser panel"
              >
                <div className="h-16 w-px rounded-full bg-border/80 transition-colors hover:bg-primary" />
              </div>
            )}
            <BrowserPanel />
          </div>
        </div>

        <EditorSidebar
          editingFile={editingFile}
          isMobile={isMobile}
          editorExpanded={editorExpanded}
          editorWidth={editorWidth}
          hasManualWidth={hasManualWidth}
          resizeHandleRef={resizeHandleRef}
          onResizeStart={handleResizeStart}
          onCloseEditor={handleCloseEditor}
          onToggleEditorExpand={handleToggleEditorExpand}
          projectPath={selectedProject.path}
          fillSpace={activeTab === 'files'}
        />
      </div>
    </div>
  );
}

export default React.memo(MainContent);
