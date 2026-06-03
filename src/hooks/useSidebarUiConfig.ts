import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../utils/api';

export type SidebarUiConfig = {
  reportIssue: { show: boolean; url: string };
  joinCommunity: { show: boolean; url: string };
  githubRepo: { show: boolean; url: string };
  githubStarBadge: { show: boolean; url: string };
  showUpdateNotification: boolean;
};

export const DEFAULT_SIDEBAR_UI_CONFIG: SidebarUiConfig = {
  reportIssue: { show: true, url: 'https://github.com/siteboon/claudecodeui/issues/new' },
  joinCommunity: { show: true, url: 'https://discord.gg/buxwujPNRE' },
  githubRepo: { show: true, url: 'https://github.com/siteboon/claudecodeui' },
  githubStarBadge: { show: true, url: 'https://github.com/siteboon/claudecodeui' },
  showUpdateNotification: true,
};

let cache: SidebarUiConfig | null = null;
let pending: Promise<SidebarUiConfig> | null = null;

export function invalidateSidebarUiConfig() {
  cache = null;
  pending = null;
}

function fetchConfig(): Promise<SidebarUiConfig> {
  if (pending) return pending;
  pending = authenticatedFetch('/api/settings/sidebar-config')
    .then((r) => r.json())
    .then((d: { success: boolean; data: SidebarUiConfig }) => {
      cache = { ...DEFAULT_SIDEBAR_UI_CONFIG, ...d.data };
      return cache;
    })
    .catch(() => {
      pending = null;
      return DEFAULT_SIDEBAR_UI_CONFIG;
    });
  return pending;
}

export function useSidebarUiConfig(): SidebarUiConfig {
  const [config, setConfig] = useState<SidebarUiConfig>(cache ?? DEFAULT_SIDEBAR_UI_CONFIG);

  useEffect(() => {
    if (cache) {
      setConfig(cache);
      return;
    }
    void fetchConfig().then(setConfig);
  }, []);

  return config;
}
