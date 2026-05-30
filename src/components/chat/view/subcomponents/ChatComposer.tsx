import { ArrowDownIcon, ImageIcon, MessageSquareIcon, PencilIcon, SaveIcon, Trash2Icon, XIcon } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  type TouchEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  PromptInput,
  PromptInputHeader,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
} from '../../../../shared/view/ui';
import type { QueuedChatMessage } from '../../hooks/useChatComposerState';
import type { PendingPermissionRequest, PermissionMode, Provider } from '../../types/types';

import CommandMenu from './CommandMenu';
import ClaudeStatus from './ClaudeStatus';
import ImageAttachment from './ImageAttachment';
import PermissionRequestsBanner from './PermissionRequestsBanner';
import ThinkingModeSelector from './ThinkingModeSelector';
import TokenUsageSummary from './TokenUsageSummary';

interface MentionableFile {
  name: string;
  path: string;
}

interface SlashCommand {
  name: string;
  description?: string;
  namespace?: string;
  path?: string;
  type?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ChatComposerProps {
  pendingPermissionRequests: PendingPermissionRequest[];
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown },
  ) => void;
  handleGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
  claudeStatus: { text: string; tokens: number; can_interrupt: boolean } | null;
  isLoading: boolean;
  onAbortSession: () => void;
  provider: Provider | string;
  permissionMode: PermissionMode | string;
  onModeSwitch: () => void;
  thinkingMode: string;
  setThinkingMode: Dispatch<SetStateAction<string>>;
  tokenBudget: Record<string, unknown> | null;
  slashCommandsCount: number;
  onToggleCommandMenu: () => void;
  hasInput: boolean;
  onClearInput: () => void;
  isUserScrolledUp: boolean;
  hasMessages: boolean;
  onScrollToBottom: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement> | TouchEvent<HTMLButtonElement>) => void;
  isDragActive: boolean;
  attachedImages: File[];
  onRemoveImage: (index: number) => void;
  uploadingImages: Map<string, number>;
  imageErrors: Map<string, string>;
  showFileDropdown: boolean;
  filteredFiles: MentionableFile[];
  selectedFileIndex: number;
  onSelectFile: (file: MentionableFile) => void;
  onCloseFileDropdown: () => void;
  filteredCommands: SlashCommand[];
  selectedCommandIndex: number;
  onCommandSelect: (command: SlashCommand, index: number, isHover: boolean) => void;
  onCloseCommandMenu: () => void;
  isCommandMenuOpen: boolean;
  frequentCommands: SlashCommand[];
  getRootProps: (...args: unknown[]) => Record<string, unknown>;
  getInputProps: (...args: unknown[]) => Record<string, unknown>;
  openImagePicker: () => void;
  inputHighlightRef: RefObject<HTMLDivElement>;
  renderInputWithMentions: (text: string) => ReactNode;
  textareaRef: RefObject<HTMLTextAreaElement>;
  input: string;
  onInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onTextareaClick: (event: MouseEvent<HTMLTextAreaElement>) => void;
  onTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onTextareaPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onTextareaScrollSync: (target: HTMLTextAreaElement) => void;
  onTextareaInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  onInputFocusChange?: (focused: boolean) => void;
  placeholder: string;
  isTextareaExpanded: boolean;
  sendByCtrlEnter?: boolean;
  queuedMessages: QueuedChatMessage[];
  isLoadingQueuedMessages: boolean;
  onUpdateQueuedMessage: (queueId: string, content: string) => Promise<boolean>;
  onDeleteQueuedMessage: (queueId: string) => Promise<boolean>;
}

export default function ChatComposer({
  pendingPermissionRequests,
  handlePermissionDecision,
  handleGrantToolPermission,
  claudeStatus,
  isLoading,
  onAbortSession,
  provider,
  permissionMode,
  onModeSwitch,
  thinkingMode,
  setThinkingMode,
  tokenBudget,
  slashCommandsCount,
  onToggleCommandMenu,
  hasInput,
  onClearInput,
  isUserScrolledUp,
  hasMessages,
  onScrollToBottom,
  onSubmit,
  isDragActive,
  attachedImages,
  onRemoveImage,
  uploadingImages,
  imageErrors,
  showFileDropdown,
  filteredFiles,
  selectedFileIndex,
  onSelectFile,
  onCloseFileDropdown,
  filteredCommands,
  selectedCommandIndex,
  onCommandSelect,
  onCloseCommandMenu,
  isCommandMenuOpen,
  frequentCommands,
  getRootProps,
  getInputProps,
  openImagePicker,
  inputHighlightRef,
  renderInputWithMentions,
  textareaRef,
  input,
  onInputChange,
  onTextareaClick,
  onTextareaKeyDown,
  onTextareaPaste,
  onTextareaScrollSync,
  onTextareaInput,
  onInputFocusChange,
  placeholder,
  isTextareaExpanded,
  sendByCtrlEnter,
  queuedMessages,
  isLoadingQueuedMessages,
  onUpdateQueuedMessage,
  onDeleteQueuedMessage,
}: ChatComposerProps) {
  const { t } = useTranslation('chat');
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueContent, setEditingQueueContent] = useState('');
  const composerContainerRef = useRef<HTMLDivElement>(null);
  const fileDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRect = textareaRef.current?.getBoundingClientRect();
  const commandMenuPosition = {
    top: textareaRect ? Math.max(16, textareaRect.top - 316) : 0,
    left: textareaRect ? textareaRect.left : 16,
    bottom: textareaRect ? window.innerHeight - textareaRect.top + 8 : 90,
  };

  // Detect if the AskUserQuestion interactive panel is active
  const hasQuestionPanel = pendingPermissionRequests.some(
    (r) => r.toolName === 'AskUserQuestion'
  );

  // Hide the thinking/status bar while any permission request is pending
  const hasPendingPermissions = pendingPermissionRequests.length > 0;

  useEffect(() => {
    if (!showFileDropdown && !isCommandMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const clickedInsideComposer = composerContainerRef.current?.contains(target) ?? false;
      if (!clickedInsideComposer) {
        onCloseCommandMenu();
        onCloseFileDropdown();
        return;
      }

      const clickedTextarea = textareaRef.current?.contains(target) ?? false;
      const clickedFileDropdown = fileDropdownRef.current?.contains(target) ?? false;
      const clickedCommandMenu =
        target instanceof Element ? Boolean(target.closest('.command-menu')) : false;

      if (showFileDropdown && !clickedTextarea && !clickedFileDropdown) {
        onCloseFileDropdown();
      }

      if (isCommandMenuOpen && !clickedCommandMenu) {
        onCloseCommandMenu();
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      onCloseCommandMenu();
      onCloseFileDropdown();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCommandMenuOpen, onCloseCommandMenu, onCloseFileDropdown, showFileDropdown, textareaRef]);

  const startEditingQueueMessage = (message: QueuedChatMessage) => {
    setEditingQueueId(message.id);
    setEditingQueueContent(message.content);
  };

  const saveEditingQueueMessage = async () => {
    if (!editingQueueId || !editingQueueContent.trim()) return;
    const updated = await onUpdateQueuedMessage(editingQueueId, editingQueueContent);
    if (updated) {
      setEditingQueueId(null);
      setEditingQueueContent('');
    }
  };

  return (
    <div className="flex-shrink-0 p-2 pb-2 sm:p-4 sm:pb-4 md:p-4 md:pb-6">
      {!hasPendingPermissions && (
        <ClaudeStatus
          status={claudeStatus}
          isLoading={isLoading}
          onAbort={onAbortSession}
          provider={provider}
        />
      )}

      {pendingPermissionRequests.length > 0 && (
        <div className="mx-auto mb-3 max-w-4xl">
          <PermissionRequestsBanner
            pendingPermissionRequests={pendingPermissionRequests}
            handlePermissionDecision={handlePermissionDecision}
            handleGrantToolPermission={handleGrantToolPermission}
          />
        </div>
      )}

      {!hasQuestionPanel && <div ref={composerContainerRef} className="relative mx-auto max-w-4xl">
        {(queuedMessages.length > 0 || isLoadingQueuedMessages) && (
          <div className="mb-2 rounded-lg border border-border/50 bg-card/80 text-sm shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
              <span className="font-medium text-foreground">
                {t('input.queue.title', { defaultValue: 'Queued messages' })}
              </span>
              <span className="text-xs text-muted-foreground">
                {isLoadingQueuedMessages
                  ? t('input.queue.loading', { defaultValue: 'Loading' })
                  : queuedMessages.length}
              </span>
            </div>
            <div className="max-h-44 overflow-y-auto">
              {queuedMessages.map((message) => {
                const isEditing = editingQueueId === message.id;
                return (
                  <div key={message.id} className="flex gap-2 border-b border-border/20 px-3 py-2 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <textarea
                          value={editingQueueContent}
                          onChange={(event) => setEditingQueueContent(event.target.value)}
                          className="max-h-28 min-h-16 w-full resize-y rounded-md border border-border/60 bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                        />
                      ) : (
                        <div className="line-clamp-2 whitespace-pre-wrap break-words text-foreground">
                          {message.content}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {message.provider}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-start gap-1">
                      {isEditing ? (
                        <PromptInputButton
                          tooltip={{ content: t('input.queue.save', { defaultValue: 'Save queued message' }) }}
                          onClick={saveEditingQueueMessage}
                          disabled={!editingQueueContent.trim()}
                        >
                          <SaveIcon />
                        </PromptInputButton>
                      ) : (
                        <PromptInputButton
                          tooltip={{ content: t('input.queue.edit', { defaultValue: 'Edit queued message' }) }}
                          onClick={() => startEditingQueueMessage(message)}
                        >
                          <PencilIcon />
                        </PromptInputButton>
                      )}
                      <PromptInputButton
                        tooltip={{ content: t('input.queue.delete', { defaultValue: 'Delete queued message' }) }}
                        onClick={() => onDeleteQueuedMessage(message.id)}
                      >
                        <Trash2Icon />
                      </PromptInputButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {isUserScrolledUp && hasMessages && (
          <div className="absolute -top-10 left-0 right-0 z-10 flex justify-center">
            <button
              type="button"
              onClick={onScrollToBottom}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-card text-muted-foreground shadow-sm transition-all duration-200 hover:bg-accent hover:text-foreground"
              title={t('input.scrollToBottom', { defaultValue: 'Scroll to bottom' })}
            >
              <ArrowDownIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        {showFileDropdown && filteredFiles.length > 0 && (
          <div
            ref={fileDropdownRef}
            className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-48 overflow-y-auto rounded-xl border border-border/50 bg-card/95 shadow-lg backdrop-blur-md"
          >
            {filteredFiles.map((file, index) => (
              <div
                key={file.path}
                className={`cursor-pointer touch-manipulation border-b border-border/30 px-4 py-3 last:border-b-0 ${
                  index === selectedFileIndex
                    ? 'bg-primary/8 text-primary'
                    : 'text-foreground hover:bg-accent/50'
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectFile(file);
                }}
              >
                <div className="text-sm font-medium">{file.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{file.path}</div>
              </div>
            ))}
          </div>
        )}

        <CommandMenu
          commands={filteredCommands}
          selectedIndex={selectedCommandIndex}
          onSelect={onCommandSelect}
          onClose={onCloseCommandMenu}
          position={commandMenuPosition}
          isOpen={isCommandMenuOpen}
          frequentCommands={frequentCommands}
        />

        <PromptInput
          onSubmit={onSubmit as (event: FormEvent<HTMLFormElement>) => void}
          status={isLoading ? 'streaming' : 'ready'}
          className={isTextareaExpanded ? 'chat-input-expanded' : ''}
          {...getRootProps()}
        >
          {isDragActive && (
            <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/15">
              <div className="rounded-xl border border-border/30 bg-card p-4 shadow-lg">
                <svg className="mx-auto mb-2 h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-sm font-medium">Drop images here</p>
              </div>
            </div>
          )}

          {attachedImages.length > 0 && (
            <PromptInputHeader>
              <div className="rounded-xl bg-muted/40 p-2">
                <div className="flex flex-wrap gap-2">
                  {attachedImages.map((file, index) => (
                    <ImageAttachment
                      key={index}
                      file={file}
                      onRemove={() => onRemoveImage(index)}
                      uploadProgress={uploadingImages.get(file.name)}
                      error={imageErrors.get(file.name)}
                    />
                  ))}
                </div>
              </div>
            </PromptInputHeader>
          )}

          <input {...getInputProps()} />

          <PromptInputBody>
            <div ref={inputHighlightRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
              <div className="chat-input-placeholder block w-full whitespace-pre-wrap break-words px-4 py-2 text-sm leading-6 text-transparent">
                {renderInputWithMentions(input)}
              </div>
            </div>

            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={onInputChange}
              onClick={onTextareaClick}
              onKeyDown={onTextareaKeyDown}
              onPaste={onTextareaPaste}
              onScroll={(event) => onTextareaScrollSync(event.target as HTMLTextAreaElement)}
              onFocus={() => onInputFocusChange?.(true)}
              onBlur={() => onInputFocusChange?.(false)}
              onInput={onTextareaInput}
              placeholder={placeholder}
            />
        </PromptInputBody>

        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton
              tooltip={{ content: t('input.attachImages') }}
              onClick={openImagePicker}
            >
              <ImageIcon />
            </PromptInputButton>

            <button
              type="button"
              onClick={onModeSwitch}
              className={`rounded-lg border p-2 text-xs font-medium transition-all duration-200 sm:px-2.5 sm:py-1 ${
                permissionMode === 'default'
                  ? 'border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted'
                  : permissionMode === 'acceptEdits'
                    ? 'border-green-300/60 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-600/40 dark:bg-green-900/15 dark:text-green-300 dark:hover:bg-green-900/25'
                    : permissionMode === 'auto'
                      ? 'border-blue-300/60 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-600/40 dark:bg-blue-900/15 dark:text-blue-300 dark:hover:bg-blue-900/25'
                      : permissionMode === 'bypassPermissions'
                        ? 'border-orange-300/60 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-600/40 dark:bg-orange-900/15 dark:text-orange-300 dark:hover:bg-orange-900/25'
                        : 'border-primary/20 bg-primary/5 text-primary hover:bg-primary/10'
              }`}
              title={t('input.clickToChangeMode')}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-2.5 w-2.5 rounded-full sm:h-1.5 sm:w-1.5 ${
                    permissionMode === 'default'
                      ? 'bg-muted-foreground'
                      : permissionMode === 'acceptEdits'
                        ? 'bg-green-500'
                        : permissionMode === 'auto'
                          ? 'bg-blue-500'
                          : permissionMode === 'bypassPermissions'
                            ? 'bg-orange-500'
                            : 'bg-primary'
                  }`}
                />
                <span className="hidden whitespace-nowrap sm:inline">
                  {permissionMode === 'default' && t('codex.modes.default')}
                  {permissionMode === 'acceptEdits' && t('codex.modes.acceptEdits')}
                  {permissionMode === 'auto' && t('codex.modes.auto')}
                  {permissionMode === 'bypassPermissions' && t('codex.modes.bypassPermissions')}
                  {permissionMode === 'plan' && t('codex.modes.plan')}
                </span>
              </div>
            </button>

            {provider === 'claude' && (
              <ThinkingModeSelector selectedMode={thinkingMode} onModeChange={setThinkingMode} onClose={() => {}} className="" />
            )}

            <TokenUsageSummary usage={tokenBudget} />

            <PromptInputButton
              tooltip={{ content: t('input.showAllCommands') }}
              onClick={onToggleCommandMenu}
              className="relative"
            >
              <MessageSquareIcon />
              {slashCommandsCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                >
                  {slashCommandsCount}
                </span>
              )}
            </PromptInputButton>

            {hasInput && (
              <PromptInputButton
                tooltip={{ content: t('input.clearInput', { defaultValue: 'Clear input' }) }}
                onClick={onClearInput}
                className="hidden sm:flex"
              >
                <XIcon />
              </PromptInputButton>
            )}

          </PromptInputTools>

          <div className="flex items-center gap-2">
            <div
              className={`hidden text-xs text-muted-foreground/50 transition-opacity duration-200 lg:block ${
                input.trim() ? 'opacity-0' : 'opacity-100'
              }`}
            >
              {sendByCtrlEnter ? t('input.hintText.ctrlEnter') : t('input.hintText.enter')}
            </div>
            <PromptInputSubmit
              status={isLoading && !input.trim() ? 'streaming' : 'ready'}
              disabled={isLoading ? false : !input.trim()}
              className="h-10 w-10 sm:h-10 sm:w-10"
              onClick={(event) => {
                if (isLoading && !input.trim()) {
                  event.preventDefault();
                  onAbortSession();
                }
              }}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
      </div>}
    </div>
  );
}
