import { Link } from 'react-router-dom';
import { Plug } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useTourStore } from '../../stores/tourStore';

export default function ConnectionBanner() {
  const user = useAuthStore(s => s.user);
  const { active, skipped } = useTourStore();

  // Show only when tour was skipped without connecting a provider
  if (active || !skipped || user?.hasConnectedProvider) return null;

  return (
    <div className="mx-3 sm:mx-4 mt-3 mb-1 px-4 py-3 bg-ats-accent/10 border border-ats-accent/20 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Plug size={18} className="text-ats-accent shrink-0" />
        <span className="text-sm text-ats-text">
          Connect a data source to see real metrics.
        </span>
      </div>
      <Link
        to="/settings/connections"
        className="w-full sm:w-auto text-center min-h-[44px] flex items-center justify-center px-5 bg-ats-accent text-white text-sm font-semibold rounded-xl hover:bg-blue-600 active:scale-[0.98] transition-all"
      >
        Go to Connections
      </Link>
    </div>
  );
}
