import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function ConfirmModal({ title, description, onConfirm, onClose }: ConfirmModalProps) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { if (!loading) onClose(); }}>
      <div className="bg-ats-card border border-ats-border rounded-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-full bg-yellow-500/15">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          </div>
          <h3 className="text-base font-bold text-ats-text">{title}</h3>
        </div>
        <p className="text-sm text-ats-text-muted mb-5">{description}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              try {
                await onConfirm();
              } finally {
                setLoading(false);
                onClose();
              }
            }}
            disabled={loading}
            className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing...</span>
            ) : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
