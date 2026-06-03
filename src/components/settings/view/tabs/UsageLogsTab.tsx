import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { authenticatedFetch } from '../../../../utils/api';
import { Badge, Button } from '../../../../shared/view/ui';

type UsageLog = {
  id: string;
  user_id: number;
  username: string;
  session_id: string;
  provider: string;
  model: string | null;
  permission_mode: string | null;
  created_at: string;
};

type ProviderStat = { provider: string; count: number };
type UserStat = { userId: number; username: string; count: number };

type UsageLogsData = {
  logs: UsageLog[];
  total: number;
  page: number;
  limit: number;
  byProvider: ProviderStat[];
  byUser: UserStat[];
};

type ManagedUser = { id: number; username: string };

type Filters = { userId: string; provider: string; from: string; to: string };

const PAGE_SIZE = 50;

const PROVIDER_BADGE: Record<string, string> = {
  claude: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  codex: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  gemini: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  cursor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  opencode: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const initialFilters: Filters = { userId: '', provider: '', from: '', to: '' };

export default function UsageLogsTab() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [pendingFilters, setPendingFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsageLogsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    authenticatedFetch('/api/admin/users')
      .then((r) => r.json())
      .then((d: { users?: ManagedUser[] }) => setUsers(d.users ?? []))
      .catch(() => {});
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.provider) params.set('provider', filters.provider);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    try {
      const res = await authenticatedFetch(`/api/admin/usage-logs?${params.toString()}`);
      const json = (await res.json()) as { success: boolean; data: UsageLogsData; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Failed to load usage logs');
      } else {
        setData(json.data);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const applyFilters = () => {
    setFilters(pendingFilters);
    setPage(1);
  };

  const resetFilters = () => {
    setPendingFilters(initialFilters);
    setFilters(initialFilters);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">使用日志</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">查看所有用户的 AI 助手请求记录</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">总请求数</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{data.total.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">活跃用户</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{data.byUser.length}</p>
          </div>
          {data.byProvider.slice(0, 2).map((s) => (
            <div key={s.provider} className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs capitalize text-muted-foreground">{s.provider} 请求</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{s.count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {data && data.byProvider.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.byProvider.map((s) => (
            <span
              key={s.provider}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${PROVIDER_BADGE[s.provider] ?? 'bg-gray-100 text-gray-800'}`}
            >
              <span className="capitalize">{s.provider}</span>
              <span className="opacity-70">{s.count.toLocaleString()}</span>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">用户</label>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={pendingFilters.userId}
              onChange={(e) => setPendingFilters((f) => ({ ...f, userId: e.target.value }))}
            >
              <option value="">全部用户</option>
              {users.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.username}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">产品</label>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={pendingFilters.provider}
              onChange={(e) => setPendingFilters((f) => ({ ...f, provider: e.target.value }))}
            >
              <option value="">全部产品</option>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="gemini">Gemini</option>
              <option value="cursor">Cursor</option>
              <option value="opencode">OpenCode</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">开始日期</label>
            <input
              type="date"
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={pendingFilters.from}
              onChange={(e) => setPendingFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">结束日期</label>
            <input
              type="date"
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={pendingFilters.to}
              onChange={(e) => setPendingFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={applyFilters} disabled={loading}>筛选</Button>
          <Button size="sm" variant="outline" onClick={resetFilters} disabled={loading}>重置</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">用户</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">产品</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">模型</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">权限模式</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">会话 ID</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && (!data || data.logs.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    暂无记录
                  </td>
                </tr>
              )}
              {!loading && data?.logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/20">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-foreground">
                    {log.username}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="secondary"
                      className={`capitalize ${PROVIDER_BADGE[log.provider] ?? ''}`}
                    >
                      {log.provider}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {log.model ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {log.permission_mode ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {log.session_id.slice(0, 8)}…
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {formatDateTime(log.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>共 {data.total.toLocaleString()} 条，第 {page} / {totalPages} 页</span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {data && data.byUser.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">用户请求统计</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">用户名</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">请求次数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.byUser.map((u) => (
                  <tr key={u.userId} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium text-foreground">{u.username}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {u.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
