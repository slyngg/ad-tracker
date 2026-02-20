import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import PageShell from '../../components/shared/PageShell';

export default function AccountPage() {
  const { user, fetchProfile, updateProfile } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
    }
  }, [user]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setProfileMsg({ type: 'error', text: 'Display name cannot be empty' });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    const ok = await updateProfile({ displayName });
    if (ok) {
      setProfileMsg({ type: 'success', text: 'Display name updated' });
    } else {
      setProfileMsg({ type: 'error', text: useAuthStore.getState().error || 'Update failed' });
    }
    setSavingProfile(false);
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setPasswordMsg({ type: 'error', text: 'Current password is required' });
      return;
    }
    if (!newPassword) {
      setPasswordMsg({ type: 'error', text: 'New password is required' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 6 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    const ok = await updateProfile({ currentPassword, password: newPassword });
    if (ok) {
      setPasswordMsg({ type: 'success', text: 'Password updated successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordMsg({ type: 'error', text: useAuthStore.getState().error || 'Password update failed' });
    }
    setSavingPassword(false);
  };

  const inputCls =
    'w-full px-4 py-3 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent';
  const labelCls = 'text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide';

  return (
    <PageShell title="Account" subtitle="Manage your profile and security settings">
      {/* User Info */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-5 mb-4">
        <h3 className="text-sm font-bold text-ats-text mb-4">Profile Information</h3>

        <div className="mb-4">
          <label className={labelCls}>Email</label>
          <div className="px-4 py-3 bg-ats-bg/50 border border-ats-border rounded-md text-ats-text-muted text-sm font-mono">
            {user?.email || 'Not available'}
          </div>
          <p className="text-[11px] text-ats-text-muted/60 mt-1">Email cannot be changed</p>
        </div>

        <div className="mb-4">
          <label className={labelCls}>User ID</label>
          <div className="px-4 py-3 bg-ats-bg/50 border border-ats-border rounded-md text-ats-text-muted text-sm font-mono">
            {user?.id || '-'}
          </div>
        </div>

        {profileMsg && (
          <div
            className={`px-3 py-2 mb-4 rounded-md text-sm ${
              profileMsg.type === 'success'
                ? 'bg-emerald-900/50 text-emerald-300'
                : 'bg-red-900/50 text-red-300'
            }`}
          >
            {profileMsg.text}
          </div>
        )}

        <form onSubmit={handleProfileSave}>
          <div className="mb-4">
            <label className={labelCls}>Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
              placeholder="Your display name"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="px-6 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
          >
            {savingProfile ? 'Saving...' : 'Update Display Name'}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-5 mb-4">
        <h3 className="text-sm font-bold text-ats-text mb-4">Change Password</h3>

        {passwordMsg && (
          <div
            className={`px-3 py-2 mb-4 rounded-md text-sm ${
              passwordMsg.type === 'success'
                ? 'bg-emerald-900/50 text-emerald-300'
                : 'bg-red-900/50 text-red-300'
            }`}
          >
            {passwordMsg.text}
          </div>
        )}

        <form onSubmit={handlePasswordSave}>
          <div className="mb-4">
            <label className={labelCls}>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputCls}
              placeholder="Enter current password"
            />
          </div>
          <div className="mb-4">
            <label className={labelCls}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
              placeholder="Enter new password (min 6 characters)"
            />
          </div>
          <div className="mb-4">
            <label className={labelCls}>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputCls}
              placeholder="Confirm new password"
            />
          </div>
          <button
            type="submit"
            disabled={savingPassword}
            className="px-6 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
          >
            {savingPassword ? 'Updating...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* Session Info */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
        <h3 className="text-sm font-bold text-ats-text mb-4">Session</h3>
        <p className="text-xs text-ats-text-muted mb-3">
          You are currently logged in. Logging out will clear your session token.
        </p>
        <button
          onClick={() => {
            if (confirm('Are you sure you want to log out?')) {
              useAuthStore.getState().logout();
            }
          }}
          className="px-6 py-2.5 bg-red-600/20 border border-red-600/40 text-red-400 rounded-lg text-sm font-semibold hover:bg-red-600/30 transition-colors"
        >
          Log Out
        </button>
      </div>
    </PageShell>
  );
}
