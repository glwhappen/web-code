import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../../../utils/api';
import { CLAUDE_MODELS, CODEX_MODELS, CURSOR_MODELS, GEMINI_MODELS } from '../../../../shared/modelConstants';
import type { PendingPermissionRequest, PermissionMode } from '../types/types';
import type { ProjectSession, LLMProvider } from '../../../types/app';

const getPermissionModesForProvider = (provider: LLMProvider): PermissionMode[] => {
  if (provider === 'codex') {
    return ['default', 'acceptEdits', 'bypassPermissions'];
  }
  if (provider === 'claude') {
    return ['default', 'auto', 'acceptEdits', 'bypassPermissions', 'plan'];
  }
  return ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
};

const getProviderPermissionModeKey = (provider: LLMProvider) => `permissionMode-${provider}`;
const getSessionPermissionModeKey = (sessionId: string) => `permissionMode-${sessionId}`;

const readValidPermissionMode = (
  key: string,
  validModes: PermissionMode[],
): PermissionMode | null => {
  const savedMode = localStorage.getItem(key) as PermissionMode | null;
  return savedMode && validModes.includes(savedMode) ? savedMode : null;
};

interface UseChatProviderStateArgs {
  selectedSession: ProjectSession | null;
}

export function useChatProviderState({ selectedSession }: UseChatProviderStateArgs) {
  const [provider, setProvider] = useState<LLMProvider>(() => {
    return (localStorage.getItem('selected-provider') as LLMProvider) || 'claude';
  });
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(() => {
    const initialProvider = (localStorage.getItem('selected-provider') as LLMProvider) || 'claude';
    const validModes = getPermissionModesForProvider(initialProvider);
    return readValidPermissionMode(getProviderPermissionModeKey(initialProvider), validModes) || 'default';
  });
  const [pendingPermissionRequests, setPendingPermissionRequests] = useState<PendingPermissionRequest[]>([]);
  const [cursorModel, setCursorModel] = useState<string>(() => {
    return localStorage.getItem('cursor-model') || CURSOR_MODELS.DEFAULT;
  });
  const [claudeModel, setClaudeModel] = useState<string>(() => {
    return localStorage.getItem('claude-model') || CLAUDE_MODELS.DEFAULT;
  });
  const [codexModel, setCodexModel] = useState<string>(() => {
    return localStorage.getItem('codex-model') || CODEX_MODELS.DEFAULT;
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    return localStorage.getItem('gemini-model') || GEMINI_MODELS.DEFAULT;
  });

  const lastProviderRef = useRef(provider);

  useEffect(() => {
    const validModes = getPermissionModesForProvider(provider);
    const sessionMode = selectedSession?.id
      ? readValidPermissionMode(getSessionPermissionModeKey(selectedSession.id), validModes)
      : null;
    const providerMode = readValidPermissionMode(getProviderPermissionModeKey(provider), validModes);
    setPermissionMode(sessionMode || providerMode || 'default');
  }, [selectedSession?.id, provider]);

  useEffect(() => {
    if (!selectedSession?.__provider || selectedSession.__provider === provider) {
      return;
    }

    setProvider(selectedSession.__provider);
    localStorage.setItem('selected-provider', selectedSession.__provider);
  }, [provider, selectedSession]);

  useEffect(() => {
    if (lastProviderRef.current === provider) {
      return;
    }
    setPendingPermissionRequests([]);
    lastProviderRef.current = provider;
  }, [provider]);

  useEffect(() => {
    setPendingPermissionRequests((previous) =>
      previous.filter((request) => !request.sessionId || request.sessionId === selectedSession?.id),
    );
  }, [selectedSession?.id]);

  useEffect(() => {
    if (provider !== 'cursor') {
      return;
    }

    authenticatedFetch('/api/cursor/config')
      .then((response) => response.json())
      .then((data) => {
        if (!data.success || !data.config?.model?.modelId) {
          return;
        }

        const modelId = data.config.model.modelId as string;
        if (!localStorage.getItem('cursor-model')) {
          setCursorModel(modelId);
        }
      })
      .catch((error) => {
        console.error('Error loading Cursor config:', error);
      });
  }, [provider]);

  const cyclePermissionMode = useCallback(() => {
    const modes = getPermissionModesForProvider(provider);

    const currentIndex = modes.indexOf(permissionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    setPermissionMode(nextMode);

    localStorage.setItem(getProviderPermissionModeKey(provider), nextMode);

    if (selectedSession?.id) {
      localStorage.setItem(getSessionPermissionModeKey(selectedSession.id), nextMode);
    }
  }, [permissionMode, provider, selectedSession?.id]);

  return {
    provider,
    setProvider,
    cursorModel,
    setCursorModel,
    claudeModel,
    setClaudeModel,
    codexModel,
    setCodexModel,
    geminiModel,
    setGeminiModel,
    permissionMode,
    setPermissionMode,
    pendingPermissionRequests,
    setPendingPermissionRequests,
    cyclePermissionMode,
  };
}
