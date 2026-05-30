import React, { useState, useRef, useCallback } from 'react';
import { Globe, RefreshCw, ExternalLink, ArrowLeft, ArrowRight, X, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PROXY_PREFIX = '/api/browser-proxy/';

// Matches http://localhost:PORT or http://127.0.0.1:PORT
const LOCAL_URL_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:(\d+))?(\/.*)?$/i;

function isLocalUrl(url: string): boolean {
  return LOCAL_URL_RE.test(url);
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Bare host:port or host/path — assume http
  return `http://${trimmed}`;
}

// Convert a localhost URL to the server-side proxy path
function toProxyUrl(url: string): string {
  const m = url.match(LOCAL_URL_RE);
  if (!m) return url;
  const host = m[1].toLowerCase();
  const port = m[3] || '80';
  const path = m[4] || '/';
  return `${PROXY_PREFIX}${host}:${port}${path}`;
}

// Convert a proxy URL (as seen in iframe.contentWindow.location.href) back to display URL
function fromProxyUrl(href: string): string | null {
  // href = "http://server:3001/api/browser-proxy/localhost:3000/some/path"
  const idx = href.indexOf(PROXY_PREFIX);
  if (idx === -1) return null;
  return 'http://' + href.slice(idx + PROXY_PREFIX.length);
}

// Determine the actual URL to load in the iframe
function getIframeUrl(displayUrl: string): string {
  return isLocalUrl(displayUrl) ? toProxyUrl(displayUrl) : displayUrl;
}

export default function BrowserPanel() {
  const { t } = useTranslation();

  // displayUrl is what the user sees in the address bar
  const [displayUrl, setDisplayUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Refs so handleIframeLoad can read latest values without stale closure
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  historyRef.current = history;
  historyIndexRef.current = historyIndex;

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const navigateTo = (url: string) => {
    const trimmed = history.slice(0, historyIndex + 1);
    const newHistory = [...trimmed, url];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setDisplayUrl(url);
    setInputUrl(url);
    setIsLoading(true);
    setRefreshKey(0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = normalizeUrl(inputUrl);
    if (url) navigateTo(url);
  };

  const handleBack = () => {
    if (!canGoBack) return;
    const newIndex = historyIndex - 1;
    const url = history[newIndex];
    setHistoryIndex(newIndex);
    setDisplayUrl(url);
    setInputUrl(url);
    setIsLoading(true);
    setRefreshKey(0);
  };

  const handleForward = () => {
    if (!canGoForward) return;
    const newIndex = historyIndex + 1;
    const url = history[newIndex];
    setHistoryIndex(newIndex);
    setDisplayUrl(url);
    setInputUrl(url);
    setIsLoading(true);
    setRefreshKey(0);
  };

  const handleRefresh = () => {
    if (!displayUrl) return;
    setIsLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    // Sync address bar when user clicks a link inside the iframe.
    // Works for same-origin pages (proxy responses are same-origin).
    try {
      const href = iframeRef.current?.contentWindow?.location?.href;
      if (!href || href === 'about:blank') return;

      // Convert proxy URL back to human-friendly display URL
      const newDisplay = fromProxyUrl(href) ?? href;

      setInputUrl(newDisplay);
      setDisplayUrl((prev) => {
        if (prev === newDisplay) return prev;
        // User clicked a link — add to history
        const h = historyRef.current;
        const idx = historyIndexRef.current;
        const newHistory = [...h.slice(0, idx + 1), newDisplay];
        setHistory(newHistory);
        const newIdx = newHistory.length - 1;
        setHistoryIndex(newIdx);
        historyIndexRef.current = newIdx;
        historyRef.current = newHistory;
        return newDisplay;
      });
    } catch {
      // Cross-origin page (non-proxy URLs) — cannot read location
    }
  }, []);

  const handleOpenInNewTab = () => {
    if (displayUrl) window.open(displayUrl, '_blank', 'noopener,noreferrer');
  };

  const btnClass =
    'flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

  const iframeUrl = displayUrl ? getIframeUrl(displayUrl) : '';
  const isProxied = displayUrl ? isLocalUrl(displayUrl) : false;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* URL bar */}
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-border bg-background px-2 py-1.5">
        <button onClick={handleBack} disabled={!canGoBack} className={btnClass} title={t('navigation.back')}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button onClick={handleForward} disabled={!canGoForward} className={btnClass} title={t('navigation.next')}>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button onClick={handleRefresh} disabled={!displayUrl} className={btnClass} title={t('buttons.refresh')}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>

        <form onSubmit={handleSubmit} className="mx-1 flex min-w-0 flex-1 items-center">
          <div className="flex flex-1 items-center gap-1.5 rounded-md border border-input bg-muted/30 px-2 py-1 transition-colors focus-within:border-primary focus-within:bg-background">
            <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder={t('browser.urlPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              spellCheck={false}
              autoComplete="off"
            />
            {inputUrl && (
              <button
                type="button"
                onClick={() => setInputUrl('')}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </form>

        {/* Proxy badge */}
        {isProxied && displayUrl && (
          <span className="flex-shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
            {t('browser.proxied')}
          </span>
        )}

        <button
          onClick={handleOpenInNewTab}
          disabled={!displayUrl}
          className={btnClass}
          title={t('browser.openInNewTab')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!iframeUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Monitor className="h-12 w-12 opacity-25" />
            <div className="text-center">
              <p className="text-sm font-medium">{t('browser.emptyTitle')}</p>
              <p className="mt-1 text-xs opacity-60">{t('browser.emptyHint')}</p>
            </div>
          </div>
        ) : (
          <>
            <iframe
              key={`${iframeUrl}|${refreshKey}`}
              ref={iframeRef}
              src={iframeUrl}
              className="h-full w-full border-none"
              onLoad={handleIframeLoad}
              title="Browser Preview"
            />
            {isLoading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
