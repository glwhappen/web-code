import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { authenticatedFetch } from '../../../../utils/api';
import { Button } from '../../../../shared/view/ui';
import { invalidateSidebarUiConfig, DEFAULT_SIDEBAR_UI_CONFIG } from '../../../../hooks/useSidebarUiConfig';
import type { SidebarUiConfig } from '../../../../hooks/useSidebarUiConfig';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type LinkRowProps = {
  label: string;
  description: string;
  show: boolean;
  url: string;
  onShowChange: (v: boolean) => void;
  onUrlChange: (v: string) => void;
};

function LinkRow({ label, description, show, url, onShowChange, onUrlChange }: LinkRowProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          <input
            type="url"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            disabled={!show}
            placeholder="https://"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 pt-0.5">
          <span className="text-xs text-muted-foreground">{show ? '显示' : '隐藏'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={show}
            onClick={() => onShowChange(!show)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ${
              show ? 'bg-primary' : 'bg-input'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                show ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      </div>
    </div>
  );
}

export default function UiLinksConfigTab() {
  const [config, setConfig] = useState<SidebarUiConfig>(DEFAULT_SIDEBAR_UI_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    authenticatedFetch('/api/admin/ui-config')
      .then((r) => r.json())
      .then((d: { success: boolean; data: SidebarUiConfig }) => {
        if (d.success) setConfig({ ...DEFAULT_SIDEBAR_UI_CONFIG, ...d.data });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const res = await authenticatedFetch('/api/admin/ui-config', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      if (res.ok) {
        invalidateSidebarUiConfig();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  };

  const set = <K extends keyof SidebarUiConfig>(
    key: K,
    value: SidebarUiConfig[K],
  ) => setConfig((c) => ({ ...c, [key]: value }));

  const setLink = (
    key: 'reportIssue' | 'joinCommunity' | 'githubRepo' | 'githubStarBadge',
    field: 'show' | 'url',
    value: boolean | string,
  ) =>
    setConfig((c) => ({
      ...c,
      [key]: { ...c[key], [field]: value },
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">界面链接配置</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">控制侧边栏中各功能入口的显示与跳转地址</p>
        </div>
        <Button onClick={handleSave} disabled={saveStatus === 'saving'} size="sm">
          {saveStatus === 'saving' ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          {saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? '保存失败' : '保存'}
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">功能入口</h3>

        <LinkRow
          label="反馈问题"
          description="侧边栏底部的「反馈问题」链接，点击跳转到 Issue 提交页"
          show={config.reportIssue.show}
          url={config.reportIssue.url}
          onShowChange={(v) => setLink('reportIssue', 'show', v)}
          onUrlChange={(v) => setLink('reportIssue', 'url', v)}
        />

        <LinkRow
          label="加入社群"
          description="侧边栏底部的「加入社群」链接，通常指向 Discord 邀请地址"
          show={config.joinCommunity.show}
          url={config.joinCommunity.url}
          onShowChange={(v) => setLink('joinCommunity', 'show', v)}
          onUrlChange={(v) => setLink('joinCommunity', 'url', v)}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">开源仓库</h3>

        <LinkRow
          label="底部版本号链接"
          description="侧边栏底部显示的版本号 + 「Open Source」文字链接"
          show={config.githubRepo.show}
          url={config.githubRepo.url}
          onShowChange={(v) => setLink('githubRepo', 'show', v)}
          onUrlChange={(v) => setLink('githubRepo', 'url', v)}
        />

        <LinkRow
          label="GitHub Star 徽章"
          description="侧边栏顶部的 GitHub Star 计数徽章（仅非平台模式可见）"
          show={config.githubStarBadge.show}
          url={config.githubStarBadge.url}
          onShowChange={(v) => setLink('githubStarBadge', 'show', v)}
          onUrlChange={(v) => setLink('githubStarBadge', 'url', v)}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">版本更新</h3>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">更新提醒</p>
            <p className="mt-0.5 text-xs text-muted-foreground">检测到新版本时，在侧边栏底部显示更新提示横条</p>
          </div>
          <label className="flex cursor-pointer items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{config.showUpdateNotification ? '显示' : '隐藏'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={config.showUpdateNotification}
              onClick={() => set('showUpdateNotification', !config.showUpdateNotification)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ${
                config.showUpdateNotification ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  config.showUpdateNotification ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {saveStatus === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400">保存失败，请重试</p>
      )}
    </div>
  );
}
