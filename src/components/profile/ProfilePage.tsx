import type { Channel } from '../../data';
import { YouTubeAccountsPanel } from './YouTubeAccountsPanel';
import { MetaAccountsPanel } from './MetaAccountsPanel';
import { ProfileTopicNotes } from './ProfileTopicNotes';
import { RecoveryPanel } from './RecoveryPanel';
import { useWorkspaceApi } from '../../services/workspaceApi';

export function ProfilePage({ accounts, onAccountsChange, onSelectAccount, onOpenDashboard }: { accounts: Channel[]; onAccountsChange: (accounts: Channel[]) => void; onSelectAccount: (account: Channel) => void; onOpenDashboard?: () => void }) {
  const { account } = useWorkspaceApi();
  return <div className="mx-auto max-w-5xl space-y-7">
    <YouTubeAccountsPanel accounts={accounts} onAccountsChange={onAccountsChange} onSelectAccount={onSelectAccount} onOpenDashboard={onOpenDashboard} />
    <MetaAccountsPanel accounts={accounts} onAccountsChange={onAccountsChange} onSelectAccount={onSelectAccount} />
    <ProfileTopicNotes />
    <RecoveryPanel />
    <div className="border-t border-border/70 pt-6">
      <p className="mb-1 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">
        <span className="h-1 w-5 rounded-full bg-accent" />
        Profile · {account.name}
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-white">Narration voices</h1>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">Choose Google Hindi or English narrators and listen to samples in Generation → Audio or the voice settings before starting Auto-Pilot. Your narrator choices are saved with each production.</p>
    </div>
  </div>;
}
