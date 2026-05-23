import { Key, Loader2, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { api } from '../../../../utils/api';

type ManagedUser = {
  id: number;
  username: string;
  created_at?: string | null;
  last_login?: string | null;
  isAdmin?: boolean;
};

type UserManagementTabProps = {
  currentUserId?: number | string;
};

type CreateUserFormState = {
  username: string;
  password: string;
};

const initialFormState: CreateUserFormState = {
  username: '',
  password: '',
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const extractErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = await response.json();
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // ignore json parse errors and fall back to default message
  }

  return fallback;
};

export default function UserManagementTab({ currentUserId }: UserManagementTabProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<number | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [formState, setFormState] = useState<CreateUserFormState>(initialFormState);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const normalizedCurrentUserId = useMemo(() => {
    if (typeof currentUserId === 'number') {
      return currentUserId;
    }

    if (typeof currentUserId === 'string' && currentUserId.trim()) {
      const parsed = Number(currentUserId);
      return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
  }, [currentUserId]);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await api.admin.users();
      if (!response.ok) {
        const message = await extractErrorMessage(response, '加载用户列表失败');
        setErrorMessage(message);
        return;
      }

      const payload = await response.json();
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
    } catch (error) {
      console.error('Failed to load users:', error);
      setErrorMessage('加载用户列表失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreateUser = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorMessage('');
      setSuccessMessage('');

      const username = formState.username.trim();
      const password = formState.password;

      if (!username || !password) {
        setErrorMessage('请输入用户名和密码');
        return;
      }

      setIsCreating(true);
      try {
        const response = await api.admin.createUser(username, password);
        if (!response.ok) {
          const message = await extractErrorMessage(response, '新增用户失败');
          setErrorMessage(message);
          return;
        }

        setFormState(initialFormState);
        setSuccessMessage(`已创建用户：${username}`);
        await loadUsers();
      } catch (error) {
        console.error('Failed to create user:', error);
        setErrorMessage('新增用户失败，请稍后重试');
      } finally {
        setIsCreating(false);
      }
    },
    [formState.password, formState.username, loadUsers],
  );

  const handleDeleteUser = useCallback(
    async (user: ManagedUser) => {
      if (!window.confirm(`确认删除用户"${user.username}"吗？此操作不可撤销，该用户的所有项目和会话数据也将被删除。`)) {
        return;
      }

      setDeletingUserId(user.id);
      setErrorMessage('');
      setSuccessMessage('');
      try {
        const response = await api.admin.deleteUser(user.id);
        if (!response.ok) {
          const message = await extractErrorMessage(response, '删除用户失败');
          setErrorMessage(message);
          return;
        }

        setSuccessMessage(`已删除用户：${user.username}`);
        await loadUsers();
      } catch (error) {
        console.error('Failed to delete user:', error);
        setErrorMessage('删除用户失败，请稍后重试');
      } finally {
        setDeletingUserId(null);
      }
    },
    [loadUsers],
  );

  const handleResetPassword = useCallback(
    async (userId: number) => {
      setErrorMessage('');
      setSuccessMessage('');

      if (!resetPasswordValue || resetPasswordValue.length < 8) {
        setErrorMessage('密码至少需要 8 位');
        return;
      }

      try {
        const response = await api.admin.resetPassword(userId, resetPasswordValue);
        if (!response.ok) {
          const message = await extractErrorMessage(response, '重置密码失败');
          setErrorMessage(message);
          return;
        }

        setSuccessMessage('密码已重置');
        setResetPasswordUserId(null);
        setResetPasswordValue('');
      } catch (error) {
        console.error('Failed to reset password:', error);
        setErrorMessage('重置密码失败，请稍后重试');
      }
    },
    [resetPasswordValue],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-medium text-foreground">用户管理</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          仅管理员可见。你可以在这里查看全部用户、创建新用户、重置密码，以及删除不再使用的账号。
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium text-foreground">新增用户</h4>
        </div>

        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={handleCreateUser}>
          <label className="space-y-2 text-sm text-foreground">
            <span>用户名</span>
            <input
              value={formState.username}
              onChange={(event) => setFormState((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="请输入用户名（≥3位）"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-blue-500"
              disabled={isCreating}
            />
          </label>

          <label className="space-y-2 text-sm text-foreground">
            <span>密码</span>
            <input
              type="password"
              value={formState.password}
              onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="≥8位，含大小写和数字"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-blue-500"
              disabled={isCreating}
            />
          </label>

          <button
            type="submit"
            disabled={isCreating}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            新增用户
          </button>
        </form>
      </div>

      {errorMessage || successMessage ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            errorMessage
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
          }`}
        >
          {errorMessage || successMessage}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="font-medium text-foreground">全部用户</h4>
            <p className="mt-1 text-sm text-muted-foreground">当前共 {users.length} 个启用中的用户。</p>
          </div>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
            disabled={isLoading}
          >
            刷新
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载用户列表...
          </div>
        ) : users.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground">暂无用户数据。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">用户名</th>
                  <th className="py-2 pr-4 font-medium">角色</th>
                  <th className="py-2 pr-4 font-medium">创建时间</th>
                  <th className="py-2 pr-4 font-medium">最近登录</th>
                  <th className="py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {users.map((user) => {
                  const isCurrentUser = normalizedCurrentUserId === user.id;
                  return (
                    <tr key={user.id}>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-foreground">{user.username}</div>
                        <div className="text-xs text-muted-foreground">ID: {user.id}</div>
                      </td>
                      <td className="py-3 pr-4">
                        {user.isAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            <Shield className="h-3 w-3" />
                            管理员
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                            普通用户
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{formatDateTime(user.created_at)}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{formatDateTime(user.last_login)}</td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setResetPasswordUserId(resetPasswordUserId === user.id ? null : user.id);
                              setResetPasswordValue('');
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
                            title="重置密码"
                          >
                            <Key className="h-3.5 w-3.5" />
                            密码
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteUser(user)}
                            disabled={deletingUserId === user.id || isCurrentUser}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground dark:border-red-900/40 dark:hover:bg-red-900/20"
                            title={isCurrentUser ? '当前登录管理员不可删除自己' : '删除用户'}
                          >
                            {deletingUserId === user.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            删除
                          </button>
                        </div>
                        {resetPasswordUserId === user.id && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="password"
                              value={resetPasswordValue}
                              onChange={(e) => setResetPasswordValue(e.target.value)}
                              placeholder="新密码（≥8位）"
                              className="w-32 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => void handleResetPassword(user.id)}
                              className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                            >
                              确认
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
