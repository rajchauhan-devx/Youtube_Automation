import { useState, useEffect } from 'react';
import type { Channel } from '../../data';
import { YouTubeAccountsPanel } from './YouTubeAccountsPanel';
import { MetaAccountsPanel } from './MetaAccountsPanel';
import { ProfileTopicNotes } from './ProfileTopicNotes';
import { RecoveryPanel } from './RecoveryPanel';
import { MotionTemplatesGallery } from './MotionTemplatesGallery';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { Users, FileText, Wrench, Sparkles, Music } from 'lucide-react';
import { GoogleFlowMusicContent } from '../generation/GoogleFlowMusicContent';

export function ProfilePage({
  accounts,
  onAccountsChange,
  onSelectAccount,
  onOpenDashboard,
  initialTab = 'accounts',
}: {
  accounts: Channel[];
  onAccountsChange: (accounts: Channel[]) => void;
  onSelectAccount: (account: Channel) => void;
  onOpenDashboard?: () => void;
  initialTab?: 'accounts' | 'topics' | 'templates' | 'recovery' | 'flow-music';
}) {
  const { account } = useWorkspaceApi();
  const [activeTab, setActiveTab] = useState<'accounts' | 'topics' | 'templates' | 'recovery' | 'flow-music'>(initialTab);
  const isAncientDharma = account?.id?.toLowerCase().includes('dharma') || account?.name?.toLowerCase().includes('dharma');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-up">
      {/* Profile Header Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">
            <span className="h-1.5 w-5 rounded-full bg-accent" />
            Channel Profile · {account?.name || 'Ancient Dharma'}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">Channel Profile & Workspace</h1>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface/90 p-1 flex-wrap">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === 'accounts'
                ? 'bg-accent text-white shadow-glow'
                : 'text-muted hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Accounts
          </button>
          <button
            onClick={() => setActiveTab('topics')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === 'topics'
                ? 'bg-accent text-white shadow-glow'
                : 'text-muted hover:text-white'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Topic Notes
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === 'templates'
                ? 'bg-accent text-white shadow-glow'
                : 'text-muted hover:text-white'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Motion Templates
          </button>
          <button
            onClick={() => setActiveTab('flow-music')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === 'flow-music'
                ? 'bg-amber-600 text-white shadow-glow'
                : 'text-amber-400 hover:text-amber-300'
            }`}
          >
            <Music className="h-3.5 w-3.5" />
            Google Flow Music
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
              Dharma
            </span>
          </button>
          <button
            onClick={() => setActiveTab('recovery')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === 'recovery'
                ? 'bg-accent text-white shadow-glow'
                : 'text-muted hover:text-white'
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            Recovery
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <YouTubeAccountsPanel
            accounts={accounts}
            onAccountsChange={onAccountsChange}
            onSelectAccount={onSelectAccount}
            onOpenDashboard={onOpenDashboard}
          />
          <MetaAccountsPanel
            accounts={accounts}
            onAccountsChange={onAccountsChange}
            onSelectAccount={onSelectAccount}
          />
          <RecoveryPanel />
        </div>
      )}

      {activeTab === 'topics' && (
        <div className="space-y-6">
          <ProfileTopicNotes />
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          <MotionTemplatesGallery />
        </div>
      )}

      {activeTab === 'flow-music' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-500/30 bg-surface/90 shadow-card p-2 sm:p-4">
            <GoogleFlowMusicContent />
          </div>
        </div>
      )}

      {activeTab === 'recovery' && (
        <div className="space-y-6">
          <RecoveryPanel />
        </div>
      )}
    </div>
  );
}
