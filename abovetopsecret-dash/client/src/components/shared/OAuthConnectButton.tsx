import { useState, useEffect, useRef, useCallback } from 'react';
import { getOAuthAuthorizeUrl, getOAuthStatus } from '../../lib/api';

interface OAuthConnectButtonProps {
  platform: string;
  onSuccess: () => void;
  onError?: (msg: string) => void;
  storeUrl?: string;
  className?: string;
  label?: string;
}

export default function OAuthConnectButton({
  platform,
  onSuccess,
  onError,
  storeUrl,
  className,
  label,
}: OAuthConnectButtonProps) {
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageReceivedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    popupRef.current = null;
    setConnecting(false);
  }, []);

  // Listen for postMessage from callback page
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'oauth-callback') return;
      messageReceivedRef.current = true;
      cleanup();
      if (event.data.success) {
        onSuccess();
      } else {
        onError?.(event.data.message || 'Connection failed');
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      cleanup();
    };
  }, [onSuccess, onError, cleanup]);

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);

    // Open blank popup immediately (must be in click handler to avoid blockers)
    const popup = window.open('about:blank', `oauth-${platform}`, 'width=600,height=700,left=200,top=100');
    popupRef.current = popup;

    if (!popup) {
      setConnecting(false);
      onError?.('Popup was blocked. Please allow popups and try again.');
      return;
    }

    try {
      const { authUrl } = await getOAuthAuthorizeUrl(platform, storeUrl);
      popup.location.href = authUrl;
    } catch (err: any) {
      popup.close();
      setConnecting(false);
      onError?.(err.message || 'Failed to start OAuth flow');
      return;
    }

    // Fallback: poll for popup close
    messageReceivedRef.current = false;
    pollRef.current = setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        cleanup();
        // If postMessage already handled the result, do nothing
        if (messageReceivedRef.current) return;
        // No postMessage received — verify server-side
        setTimeout(async () => {
          try {
            const statuses = await getOAuthStatus();
            const match = statuses.find(s => s.platform === platform);
            if (match?.status === 'connected') {
              onSuccess();
            } else {
              onError?.(match?.error || 'Connection was not completed');
            }
          } catch {
            onError?.('Failed to verify connection status');
          }
        }, 500);
      }
    }, 1000);
  };

  const platformLabels: Record<string, string> = {
    meta: 'Connect Meta',
    google: 'Connect Google',
    shopify: 'Connect Shopify',
    tiktok: 'Connect TikTok',
    klaviyo: 'Connect Klaviyo',
  };

  return (
    <button
      onClick={handleConnect}
      disabled={connecting}
      className={className || 'px-4 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60'}
    >
      {connecting ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Connecting...
        </span>
      ) : (
        label || platformLabels[platform] || `Connect ${platform}`
      )}
    </button>
  );
}
