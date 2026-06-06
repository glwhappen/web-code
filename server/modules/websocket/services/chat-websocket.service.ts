import type { WebSocket } from 'ws';

import { assertUserOwnsProjectPath } from '@/modules/projects/services/project-authorization.service.js';
import { connectedClients } from '@/modules/websocket/services/websocket-state.service.js';
import { WebSocketWriter } from '@/modules/websocket/services/websocket-writer.service.js';
import type {
  AnyRecord,
  AuthenticatedWebSocketRequest,
  LLMProvider,
} from '@/shared/types.js';
import { AppError, createNormalizedMessage, parseIncomingJsonObject } from '@/shared/utils.js';

type ChatIncomingMessage = AnyRecord & {
  type?: string;
  command?: string;
  options?: AnyRecord;
  provider?: string;
  sessionId?: string;
  requestId?: string;
  allow?: unknown;
  updatedInput?: unknown;
  message?: unknown;
  rememberEntry?: unknown;
};

const DEFAULT_PROVIDER: LLMProvider = 'claude';

type ChatWebSocketDependencies = {
  queryClaudeSDK: (command: string, options: unknown, writer: WebSocketWriter) => Promise<unknown>;
  spawnCursor: (command: string, options: unknown, writer: WebSocketWriter) => Promise<unknown>;
  queryCodex: (command: string, options: unknown, writer: WebSocketWriter) => Promise<unknown>;
  spawnGemini: (command: string, options: unknown, writer: WebSocketWriter) => Promise<unknown>;
  abortClaudeSDKSession: (sessionId: string, userId?: string | number | null) => Promise<boolean>;
  abortCursorSession: (sessionId: string, userId?: string | number | null) => boolean;
  abortCodexSession: (sessionId: string, userId?: string | number | null) => boolean;
  abortGeminiSession: (sessionId: string, userId?: string | number | null) => boolean;
  resolveToolApproval: (
    requestId: string,
    payload: {
      allow: boolean;
      updatedInput?: unknown;
      message?: string;
      rememberEntry?: unknown;
    }
  ) => void;
  isClaudeSDKSessionActive: (sessionId: string, userId?: string | number | null) => boolean;
  isCursorSessionActive: (sessionId: string, userId?: string | number | null) => boolean;
  isCodexSessionActive: (sessionId: string, userId?: string | number | null) => boolean;
  isGeminiSessionActive: (sessionId: string, userId?: string | number | null) => boolean;
  reconnectSessionWriter: (sessionId: string, ws: WebSocket, userId?: string | number | null) => boolean;
  getPendingApprovalsForSession: (sessionId: string, userId?: string | number | null) => unknown[];
  getActiveClaudeSDKSessions: (userId?: string | number | null) => unknown;
  getActiveCursorSessions: (userId?: string | number | null) => unknown;
  getActiveCodexSessions: (userId?: string | number | null) => unknown;
  getActiveGeminiSessions: (userId?: string | number | null) => unknown;
};

/**
 * Normalizes potentially invalid provider names coming from websocket payloads.
 */
function readProvider(value: unknown): LLMProvider {
  if (value === 'claude' || value === 'cursor' || value === 'codex' || value === 'gemini' || value === 'opencode') {
    return value;
  }

  return DEFAULT_PROVIDER;
}

/**
 * Extracts the authenticated request user id in the formats currently produced
 * by platform and OSS auth code paths.
 */
function readRequestUserId(
  request: AuthenticatedWebSocketRequest | undefined
): string | number | null {
  const user = request?.user;
  if (!user) {
    return null;
  }

  if (typeof user.id === 'string' || typeof user.id === 'number') {
    return user.id;
  }

  if (typeof user.userId === 'string' || typeof user.userId === 'number') {
    return user.userId;
  }

  return null;
}

/**
 * Pulls `cwd` out of the websocket message options and confirms the caller
 * owns it. Returning the normalized path lets the downstream spawn use the
 * canonical form instead of whatever the client happened to send.
 *
 * Without this gate, any authenticated user could spawn a CLI in another
 * user's project (or any path on disk) by setting `options.cwd` directly.
 */
function authorizeOptionsCwd(
  userId: string | number | null,
  options: AnyRecord | undefined,
): { authorized: true; cwd: string } | { authorized: false; error: AppError } {
  try {
    const cwd = assertUserOwnsProjectPath(userId, options?.cwd);
    return { authorized: true, cwd };
  } catch (error) {
    if (error instanceof AppError) {
      return { authorized: false, error };
    }
    return {
      authorized: false,
      error: new AppError('Failed to authorize working directory', {
        code: 'PROJECT_AUTHORIZATION_FAILED',
        statusCode: 500,
      }),
    };
  }
}

/**
 * Handles authenticated chat websocket messages used by the main chat panel.
 */
export function handleChatConnection(
  ws: WebSocket,
  request: AuthenticatedWebSocketRequest,
  dependencies: ChatWebSocketDependencies
): void {
  console.log('[INFO] Chat WebSocket connected');
  connectedClients.add(ws);

  const writer = new WebSocketWriter(ws, readRequestUserId(request));

  const sendAuthorizationError = (error: AppError, provider: LLMProvider): void => {
    writer.send({
      type: 'error',
      error: error.message,
      code: error.code,
      provider,
    });
  };

  ws.on('message', async (rawMessage) => {
    try {
      const parsed = parseIncomingJsonObject(rawMessage);
      if (!parsed) {
        throw new Error('Invalid websocket payload');
      }

      const data = parsed as ChatIncomingMessage;
      const messageType = data.type;
      if (!messageType) {
        throw new Error('Message type is required');
      }

      if (messageType === 'claude-command') {
        const authorization = authorizeOptionsCwd(writer.userId, data.options);
        if (!authorization.authorized) {
          sendAuthorizationError(authorization.error, 'claude');
          return;
        }
        const sanitizedOptions = { ...(data.options ?? {}), cwd: authorization.cwd };
        await dependencies.queryClaudeSDK(data.command ?? '', sanitizedOptions, writer);
        return;
      }

      if (messageType === 'cursor-command') {
        const authorization = authorizeOptionsCwd(writer.userId, data.options);
        if (!authorization.authorized) {
          sendAuthorizationError(authorization.error, 'cursor');
          return;
        }
        const sanitizedOptions = { ...(data.options ?? {}), cwd: authorization.cwd };
        await dependencies.spawnCursor(data.command ?? '', sanitizedOptions, writer);
        return;
      }

      if (messageType === 'codex-command') {
        const authorization = authorizeOptionsCwd(writer.userId, data.options);
        if (!authorization.authorized) {
          sendAuthorizationError(authorization.error, 'codex');
          return;
        }
        const sanitizedOptions = { ...(data.options ?? {}), cwd: authorization.cwd };
        await dependencies.queryCodex(data.command ?? '', sanitizedOptions, writer);
        return;
      }

      if (messageType === 'gemini-command') {
        const authorization = authorizeOptionsCwd(writer.userId, data.options);
        if (!authorization.authorized) {
          sendAuthorizationError(authorization.error, 'gemini');
          return;
        }
        const sanitizedOptions = { ...(data.options ?? {}), cwd: authorization.cwd };
        await dependencies.spawnGemini(data.command ?? '', sanitizedOptions, writer);
        return;
      }

      if (messageType === 'opencode-command') {
        await dependencies.spawnOpenCode(data.command ?? '', data.options, writer);
        return;
      }

      if (messageType === 'cursor-resume') {
        const authorization = authorizeOptionsCwd(writer.userId, data.options);
        if (!authorization.authorized) {
          sendAuthorizationError(authorization.error, 'cursor');
          return;
        }
        await dependencies.spawnCursor(
          '',
          {
            sessionId: data.sessionId,
            resume: true,
            cwd: authorization.cwd,
          },
          writer
        );
        return;
      }

      if (messageType === 'abort-session') {
        const provider = readProvider(data.provider);
        const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
        const userId = writer.userId;
        let success = false;

        if (provider === 'cursor') {
          success = dependencies.abortCursorSession(sessionId, userId);
        } else if (provider === 'codex') {
          success = dependencies.abortCodexSession(sessionId, userId);
        } else if (provider === 'gemini') {
          success = dependencies.abortGeminiSession(sessionId, userId);
        } else {
          success = await dependencies.abortClaudeSDKSession(sessionId, userId);
        }

        writer.send(
          createNormalizedMessage({
            kind: 'complete',
            exitCode: success ? 0 : 1,
            aborted: true,
            success,
            sessionId,
            provider,
          })
        );
        return;
      }

      if (messageType === 'claude-permission-response') {
        if (typeof data.requestId === 'string' && data.requestId.length > 0) {
          dependencies.resolveToolApproval(data.requestId, {
            allow: Boolean(data.allow),
            updatedInput: data.updatedInput,
            message: typeof data.message === 'string' ? data.message : undefined,
            rememberEntry: data.rememberEntry,
          });
        }
        return;
      }

      if (messageType === 'cursor-abort') {
        const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
        const success = dependencies.abortCursorSession(sessionId, writer.userId);
        writer.send(
          createNormalizedMessage({
            kind: 'complete',
            exitCode: success ? 0 : 1,
            aborted: true,
            success,
            sessionId,
            provider: 'cursor',
          })
        );
        return;
      }

      if (messageType === 'check-session-status') {
        const provider = readProvider(data.provider);
        const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
        const userId = writer.userId;
        let isActive = false;

        if (provider === 'cursor') {
          isActive = dependencies.isCursorSessionActive(sessionId, userId);
        } else if (provider === 'codex') {
          isActive = dependencies.isCodexSessionActive(sessionId, userId);
        } else if (provider === 'gemini') {
          isActive = dependencies.isGeminiSessionActive(sessionId, userId);
        } else {
          isActive = dependencies.isClaudeSDKSessionActive(sessionId, userId);
          if (isActive) {
            dependencies.reconnectSessionWriter(sessionId, ws, userId);
          }
        }

        writer.send({
          type: 'session-status',
          sessionId,
          provider,
          isProcessing: isActive,
        });
        return;
      }

      if (messageType === 'get-pending-permissions') {
        const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
        const userId = writer.userId;
        if (sessionId && dependencies.isClaudeSDKSessionActive(sessionId, userId)) {
          const pending = dependencies.getPendingApprovalsForSession(sessionId, userId);
          writer.send({
            type: 'pending-permissions-response',
            sessionId,
            data: pending,
          });
        }
        return;
      }

      if (messageType === 'get-active-sessions') {
        const userId = writer.userId;
        writer.send({
          type: 'active-sessions',
          sessions: {
            claude: dependencies.getActiveClaudeSDKSessions(userId),
            cursor: dependencies.getActiveCursorSessions(userId),
            codex: dependencies.getActiveCodexSessions(userId),
            gemini: dependencies.getActiveGeminiSessions(userId),
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[ERROR] Chat WebSocket error:', message);
      writer.send({
        type: 'error',
        error: message,
      });
    }
  });

  ws.on('close', () => {
    console.log('[INFO] Chat client disconnected');
    connectedClients.delete(ws);
  });
}
