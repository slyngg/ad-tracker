import { useSyncStatus } from '../../hooks/useSyncStatus';

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  google: 'GA4',
  shopify: 'Shopify',
  tiktok: 'TikTok',
  klaviyo: 'Klaviyo',
  checkoutChamp: 'CC',
};

/**
 * Slim global banner that shows sync progress across the app.
 * Mount this in AppLayout so it appears on every page.
 */
export default function SyncBanner() {
  const { isSyncing, platforms, allDone } = useSyncStatus();

  if (!isSyncing && !allDone) return null;
  if (allDone && platforms.every((p) => p.status === 'done' || p.status === 'error')) return null;

  const activePlatforms = platforms.filter((p) => p.status === 'syncing');
  const donePlatforms = platforms.filter((p) => p.status === 'done');
  const total = platforms.length || 1;
  const pct = Math.round((donePlatforms.length / total) * 100);

  return (
    <div className="bg-ats-accent/10 border-b border-ats-accent/20 px-4 py-1.5 flex items-center gap-3">
      <div className="relative w-3.5 h-3.5 shrink-0">
        <div className="absolute inset-0 rounded-full border border-ats-accent/40" />
        <div className="absolute inset-0 rounded-full border border-ats-accent border-t-transparent animate-spin" style={{ animationDuration: '1.2s' }} />
      </div>
      <span className="text-xs text-ats-accent font-medium">
        Syncing{activePlatforms.length > 0 ? ` ${activePlatforms.map((p) => PLATFORM_LABELS[p.platform] || p.platform).join(', ')}` : ''}...
      </span>
      <div className="flex-1 max-w-[120px] h-1 bg-ats-accent/20 rounded-full overflow-hidden">
        <div className="h-full bg-ats-accent rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 8)}%` }} />
      </div>
      <span className="text-xs sm:text-[10px] text-ats-accent/70 font-mono">{donePlatforms.length}/{total}</span>
    </div>
  );
}
