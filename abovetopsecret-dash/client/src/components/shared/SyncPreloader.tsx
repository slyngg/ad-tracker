import { useState, useEffect, useRef } from 'react';
import { useSyncStatus, PlatformSyncState } from '../../hooks/useSyncStatus';
import { getOAuthStatus, OAuthStatus } from '../../lib/api';

const PLATFORM_META: Record<string, { label: string; icon: string; color: string }> = {
  meta: { label: 'Meta Ads', icon: '🔷', color: '#1877f2' },
  google: { label: 'Google Analytics', icon: '🔴', color: '#ea4335' },
  shopify: { label: 'Shopify', icon: '🟢', color: '#96bf48' },
  tiktok: { label: 'TikTok Ads', icon: '🎵', color: '#ff0050' },
  newsbreak: { label: 'NewsBreak Ads', icon: '🟠', color: '#ea580c' },
  klaviyo: { label: 'Klaviyo', icon: '💜', color: '#8e24aa' },
  checkoutChamp: { label: 'CheckoutChamp', icon: '🔵', color: '#2196f3' },
};

function PlatformRow({ platform, syncState }: { platform: string; syncState?: 'idle' | 'syncing' | 'done' | 'error' }) {
  const meta = PLATFORM_META[platform] || { label: platform, icon: '🔌', color: 'var(--ats-text-muted)' };
  const state = syncState || 'syncing';

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-lg w-7 text-center">{meta.icon}</span>
      <span className="text-sm text-ats-text flex-1 font-medium">{meta.label}</span>
      <div className="flex items-center gap-2">
        {state === 'syncing' && (
          <>
            <div className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: meta.color, animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: meta.color, animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: meta.color, animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-ats-text-muted font-mono">Syncing</span>
          </>
        )}
        {state === 'done' && (
          <>
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs text-emerald-400 font-mono">Ready</span>
          </>
        )}
        {state === 'error' && (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs text-amber-400 font-mono">Retry later</span>
          </>
        )}
        {state === 'idle' && (
          <>
            <span className="w-2 h-2 rounded-full bg-ats-text-muted" />
            <span className="text-xs text-ats-text-muted font-mono">Waiting</span>
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
      <div className="h-3 w-20 bg-ats-border rounded animate-pulse mb-3" />
      <div className="h-7 w-28 bg-ats-border rounded animate-pulse mb-2" />
      <div className="h-7 w-full bg-ats-border/50 rounded animate-pulse" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
      <div className="h-3 w-36 bg-ats-border rounded animate-pulse mb-4" />
      <div className="flex items-end gap-1 h-[180px] pt-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-ats-border/40 rounded-t animate-pulse"
            style={{
              height: `${30 + Math.sin(i * 0.8) * 30 + Math.random() * 20}%`,
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
      <div className="h-3 w-28 bg-ats-border rounded animate-pulse mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 py-2.5 border-t border-ats-border/30">
          <div className="h-3 flex-[2] bg-ats-border/50 rounded animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          <div className="h-3 flex-1 bg-ats-border/30 rounded animate-pulse" style={{ animationDelay: `${i * 100 + 50}ms` }} />
          <div className="h-3 flex-1 bg-ats-border/30 rounded animate-pulse" style={{ animationDelay: `${i * 100 + 100}ms` }} />
          <div className="h-3 w-16 bg-ats-border/30 rounded animate-pulse" style={{ animationDelay: `${i * 100 + 150}ms` }} />
        </div>
      ))}
    </div>
  );
}

interface SyncPreloaderProps {
  hasData: boolean;
  loading: boolean;
  children: React.ReactNode;
}

export default function SyncPreloader({ hasData, loading, children }: SyncPreloaderProps) {
  const { isSyncing, platforms, allDone } = useSyncStatus();
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [loadedConnections, setLoadedConnections] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);

  // Load connected platforms
  useEffect(() => {
    getOAuthStatus()
      .then((statuses: OAuthStatus[]) => {
        setConnectedPlatforms(statuses.filter(s => s.status === 'connected').map(s => s.platform));
        setLoadedConnections(true);
      })
      .catch(() => setLoadedConnections(true));
  }, []);

  // Animate progress bar
  useEffect(() => {
    if (!isSyncing && !allDone) return;

    const doneCount = platforms.filter(p => p.status === 'done').length;
    const total = Math.max(platforms.length, connectedPlatforms.length, 1);
    const target = allDone ? 100 : Math.round((doneCount / total) * 90);

    const interval = setInterval(() => {
      progressRef.current = Math.min(progressRef.current + 1, target);
      setProgress(progressRef.current);
      if (progressRef.current >= target) clearInterval(interval);
    }, 40);

    return () => clearInterval(interval);
  }, [isSyncing, allDone, platforms, connectedPlatforms]);

  // If user has data or loading is still happening from API, or user dismissed, show content
  if (hasData || dismissed || !loadedConnections) return <>{children}</>;

  // If not loading and no data and no sync in progress — show the preloader skeleton
  // This catches the case where syncs are in-flight but HTTP hasn't returned data yet
  if (!loading && !hasData && (isSyncing || connectedPlatforms.length > 0)) {
    // Merge WS sync states with connected platforms
    const platformStates: { platform: string; state: PlatformSyncState['status'] }[] =
      connectedPlatforms.map((p) => {
        const ws = platforms.find((ps) => ps.platform === p);
        return { platform: p, state: ws?.status || 'syncing' };
      });

    const allPlatformsDone = platformStates.every(p => p.state === 'done' || p.state === 'error');

    // If all done, let data through
    if (allPlatformsDone && allDone) return <>{children}</>;

    return (
      <div className="space-y-6">
        {/* Sync Status Panel */}
        <div className="bg-ats-card rounded-2xl border border-ats-border p-4 sm:p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-full border-2 border-ats-accent/30" />
              <div
                className="absolute inset-0 rounded-full border-2 border-ats-accent border-t-transparent animate-spin"
                style={{ animationDuration: '1.5s' }}
              />
            </div>
            <div>
              <h2 className="text-base font-bold text-ats-text">Pulling your data...</h2>
              <p className="text-xs text-ats-text-muted">Your dashboard is loading with real-time data from your connected platforms.</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-ats-border rounded-full overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ats-accent to-blue-400 transition-all duration-300 ease-out"
              style={{ width: `${Math.max(progress, 5)}%` }}
            />
          </div>

          {/* Platform rows */}
          <div className="divide-y divide-ats-border/50">
            {platformStates.map((p) => (
              <PlatformRow key={p.platform} platform={p.platform} syncState={p.state} />
            ))}
          </div>

          {/* Skip button */}
          <button
            onClick={() => setDismissed(true)}
            className="mt-4 text-xs text-ats-text-muted hover:text-ats-text transition-colors"
          >
            Skip and view dashboard →
          </button>
        </div>

        {/* Skeleton Dashboard Preview */}
        <div className="opacity-60">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <SkeletonChart />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <SkeletonTable />
            <SkeletonTable />
          </div>
        </div>
      </div>
    );
  }

  // Default: show children (normal page content)
  return <>{children}</>;
}
