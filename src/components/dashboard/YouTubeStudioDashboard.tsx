import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clapperboard,
  Clock,
  Eye,
  ExternalLink,
  Film,
  Filter,
  Flame,
  Globe,
  Layers,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Users,
  Video,
  X,
  Youtube,
  Zap,
  AlertCircle,
} from 'lucide-react';
import type { Channel, Section } from '../../data';
import { StudioPageHeader } from '../ui/studio';
import {
  fetchProfileYouTubeStudio,
  safeExternalYoutubeUrl,
  type AccountStudioOverview,
  type StudioVideoItem,
} from '../../services/youtubeStudioApi';

type StudioSubTab = 'analytics' | 'content' | 'comparison' | 'workspaces';
type FormatFilter = 'all' | 'shorts' | 'long';
type PrivacyFilter = 'all' | 'public' | 'unlisted' | 'private';
type SortBy = 'date' | 'views' | 'likes' | 'comments' | 'engagement';

export interface YouTubeStudioDashboardProps {
  accounts: Channel[];
  activeAccount: Channel;
  onSelectAccount: (account: Channel) => void;
  onOpenWorkspace: (account: Channel, section: Section) => void;
  onManageAccounts: () => void;
}

export interface EnrichedStudioVideo extends StudioVideoItem {
  accountId: string;
  accountName: string;
  accountColor: string;
  accountAvatar: string;
  channelTitle: string;
  channelAvatar: string;
  channelAvgViews: number;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return value.toLocaleString();
}

function formatFullNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString();
}

function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return '—';
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return '—';
  const diffMs = Date.now() - ts;
  const diffSec = Math.max(1, Math.floor(diffMs / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears}y ago`;
}

function formatShortDate(isoDate: string): string {
  if (!isoDate) return '—';
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return '—';
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ChannelAvatar({
  avatarUrl,
  fallbackText,
  color,
  size = 'md',
}: {
  avatarUrl?: string;
  fallbackText: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [imgError, setImgError] = useState(false);
  const dimensions =
    size === 'lg'
      ? 'h-12 w-12 rounded-2xl text-sm'
      : size === 'sm'
      ? 'h-6 w-6 rounded-lg text-[10px]'
      : 'h-9 w-9 rounded-xl text-xs';

  return (
    <div
      className={`relative flex ${dimensions} shrink-0 items-center justify-center overflow-hidden font-extrabold text-white shadow-inner ring-1 ring-white/15`}
      style={{ backgroundColor: color }}
    >
      <span>{fallbackText.slice(0, 2).toUpperCase()}</span>
      {avatarUrl && !imgError && (
        <img
          src={avatarUrl}
          alt={fallbackText}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

export function YouTubeStudioDashboard({
  accounts,
  activeAccount,
  onSelectAccount,
  onOpenWorkspace,
  onManageAccounts,
}: YouTubeStudioDashboardProps) {
  const [overviews, setOverviews] = useState<Record<string, AccountStudioOverview>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('all');
  const [subTab, setSubTab] = useState<StudioSubTab>('analytics');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [privacyFilter, setPrivacyFilter] = useState<PrivacyFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedVideo, setInspectedVideo] = useState<EnrichedStudioVideo | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string>('');
  const mountedRef = useRef(true);

  const loadAllProfiles = useCallback(
    async (forceRefresh = false, signal?: AbortSignal) => {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      try {
        const results = await Promise.all(
          accounts.map(async (account) => {
            try {
              return await fetchProfileYouTubeStudio(account, {
                forceRefresh,
                signal,
              });
            } catch (err) {
              return {
                accountId: account.id,
                accountName: account.name,
                accountColor: account.color,
                accountAvatar: account.avatar,
                boundChannelId: account.youtubeChannelId || null,
                boundChannelTitle: account.youtubeChannelTitle || null,
                configured: false,
                authenticated: false,
                credentialSource: 'none' as const,
                message:
                  err instanceof Error
                    ? err.message
                    : 'Could not load YouTube Studio stats',
                fetchedAt: new Date().toISOString(),
                channel: null,
                videos: [],
                analytics: {
                  recentVideosCount: 0,
                  recentViews: 0,
                  recentLikes: 0,
                  recentComments: 0,
                  avgViewsPerVideo: 0,
                  avgLikesPerVideo: 0,
                  avgCommentsPerVideo: 0,
                  avgEngagementRate: 0,
                  shortsCount: 0,
                  shortsViews: 0,
                  shortsLikes: 0,
                  longCount: 0,
                  longViews: 0,
                  longLikes: 0,
                  viewsLast7Days: 0,
                  viewsLast28Days: 0,
                  uploadsLast7Days: 0,
                  uploadsLast28Days: 0,
                  latestVideo: null,
                  topVideos: [],
                },
                workspaces: {
                  shorts: { profile: 'shorts', scriptCount: 0, activeCount: 0, renderedCount: 0, uploadedCount: 0 },
                  long: { profile: 'long', scriptCount: 0, activeCount: 0, renderedCount: 0, uploadedCount: 0 },
                  mixed: { profile: 'mixed', scriptCount: 0, activeCount: 0, renderedCount: 0, uploadedCount: 0 },
                  totalScripts: 0,
                  totalActive: 0,
                  totalRendered: 0,
                  totalUploaded: 0,
                },
              } satisfies AccountStudioOverview;
            }
          }),
        );

        if (!mountedRef.current || signal?.aborted) return;
        const map: Record<string, AccountStudioOverview> = {};
        for (const item of results) {
          map[item.accountId] = item;
        }
        setOverviews(map);
        setLastFetchedAt(new Date().toISOString());
      } catch (err) {
        if (mountedRef.current && !signal?.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load YouTube Studio dashboard',
          );
        }
      } finally {
        if (mountedRef.current && !signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accounts],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void loadAllProfiles(false, controller.signal);
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [loadAllProfiles]);

  const orderedProfiles = useMemo(
    () =>
      accounts.map(
        (acc) =>
          overviews[acc.id] || {
            accountId: acc.id,
            accountName: acc.name,
            accountColor: acc.color,
            accountAvatar: acc.avatar,
            boundChannelId: acc.youtubeChannelId || null,
            boundChannelTitle: acc.youtubeChannelTitle || null,
            configured: false,
            authenticated: false,
            credentialSource: 'none' as const,
            fetchedAt: '',
            channel: null,
            videos: [],
            analytics: {
              recentVideosCount: 0,
              recentViews: 0,
              recentLikes: 0,
              recentComments: 0,
              avgViewsPerVideo: 0,
              avgLikesPerVideo: 0,
              avgCommentsPerVideo: 0,
              avgEngagementRate: 0,
              shortsCount: 0,
              shortsViews: 0,
              shortsLikes: 0,
              longCount: 0,
              longViews: 0,
              longLikes: 0,
              viewsLast7Days: 0,
              viewsLast28Days: 0,
              uploadsLast7Days: 0,
              uploadsLast28Days: 0,
              latestVideo: null,
              topVideos: [],
            },
            workspaces: {
              shorts: { profile: 'shorts', scriptCount: 0, activeCount: 0, renderedCount: 0, uploadedCount: 0 },
              long: { profile: 'long', scriptCount: 0, activeCount: 0, renderedCount: 0, uploadedCount: 0 },
              mixed: { profile: 'mixed', scriptCount: 0, activeCount: 0, renderedCount: 0, uploadedCount: 0 },
              totalScripts: 0,
              totalActive: 0,
              totalRendered: 0,
              totalUploaded: 0,
            },
          },
      ),
    [accounts, overviews],
  );

  const scopedProfiles = useMemo(
    () =>
      selectedProfileId === 'all'
        ? orderedProfiles
        : orderedProfiles.filter((p) => p.accountId === selectedProfileId),
    [orderedProfiles, selectedProfileId],
  );

  const kpiSummary = useMemo(() => {
    const totalProfiles = scopedProfiles.length;
    const connectedProfiles = scopedProfiles.filter((p) => p.authenticated).length;
    const totalSubscribers = scopedProfiles.reduce(
      (sum, p) => sum + (p.channel?.subscriberCount || 0),
      0,
    );
    const totalViews = scopedProfiles.reduce(
      (sum, p) => sum + Math.max(p.channel?.viewCount || 0, p.analytics.recentViews),
      0,
    );
    const totalVideos = scopedProfiles.reduce(
      (sum, p) => sum + Math.max(p.channel?.videoCount || 0, p.videos.length),
      0,
    );
    const recentViews = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.recentViews,
      0,
    );
    const recentLikes = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.recentLikes,
      0,
    );
    const recentComments = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.recentComments,
      0,
    );
    const recentVideosCount = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.recentVideosCount,
      0,
    );
    const shortsCount = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.shortsCount,
      0,
    );
    const shortsViews = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.shortsViews,
      0,
    );
    const shortsLikes = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.shortsLikes,
      0,
    );
    const longCount = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.longCount,
      0,
    );
    const longViews = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.longViews,
      0,
    );
    const longLikes = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.longLikes,
      0,
    );
    const viewsLast28Days = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.viewsLast28Days,
      0,
    );
    const uploadsLast28Days = scopedProfiles.reduce(
      (sum, p) => sum + p.analytics.uploadsLast28Days,
      0,
    );
    const totalScripts = scopedProfiles.reduce(
      (sum, p) => sum + p.workspaces.totalScripts,
      0,
    );
    const totalRendered = scopedProfiles.reduce(
      (sum, p) => sum + p.workspaces.totalRendered,
      0,
    );
    const avgViewsPerVideo =
      recentVideosCount > 0 ? Math.round(recentViews / recentVideosCount) : 0;
    const engagementRate =
      recentViews > 0
        ? Number((((recentLikes + recentComments) / recentViews) * 100).toFixed(2))
        : 0;

    return {
      totalProfiles,
      connectedProfiles,
      totalSubscribers,
      totalViews,
      totalVideos,
      recentViews,
      recentLikes,
      recentComments,
      recentVideosCount,
      shortsCount,
      shortsViews,
      shortsLikes,
      longCount,
      longViews,
      longLikes,
      viewsLast28Days,
      uploadsLast28Days,
      totalScripts,
      totalRendered,
      avgViewsPerVideo,
      engagementRate,
    };
  }, [scopedProfiles]);

  const allEnrichedVideos = useMemo<EnrichedStudioVideo[]>(() => {
    const items: EnrichedStudioVideo[] = [];
    for (const profile of scopedProfiles) {
      const channelTitle =
        profile.channel?.title ||
        profile.boundChannelTitle ||
        profile.accountName;
      const channelAvatar = profile.channel?.avatar || '';
      const channelAvgViews = profile.analytics.avgViewsPerVideo || 0;
      for (const video of profile.videos) {
        items.push({
          ...video,
          accountId: profile.accountId,
          accountName: profile.accountName,
          accountColor: profile.accountColor,
          accountAvatar: profile.accountAvatar,
          channelTitle,
          channelAvatar,
          channelAvgViews,
        });
      }
    }
    return items;
  }, [scopedProfiles]);

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allEnrichedVideos.filter((video) => {
      if (formatFilter === 'shorts' && !video.isShort) return false;
      if (formatFilter === 'long' && video.isShort) return false;
      if (privacyFilter !== 'all' && video.privacyStatus !== privacyFilter) {
        return false;
      }
      if (q) {
        const hay = `${video.title} ${video.description} ${video.channelTitle} ${video.accountName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'views') return b.viewCount - a.viewCount;
      if (sortBy === 'likes') return b.likeCount - a.likeCount;
      if (sortBy === 'comments') return b.commentCount - a.commentCount;
      if (sortBy === 'engagement') return b.engagementRate - a.engagementRate;
      return (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0);
    });

    return list;
  }, [allEnrichedVideos, formatFilter, privacyFilter, searchQuery, sortBy]);

  const topVideosAcrossScope = useMemo(
    () => [...allEnrichedVideos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 6),
    [allEnrichedVideos],
  );

  const chartVideos = useMemo(
    () =>
      [...allEnrichedVideos]
        .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
        .slice(0, 16)
        .reverse(),
    [allEnrichedVideos],
  );

  const maxChartViews = useMemo(
    () => Math.max(1, ...chartVideos.map((v) => v.viewCount)),
    [chartVideos],
  );

  return (
    <div aria-label="YouTube Studio Dashboard" className="space-y-6 animate-fade-up">
      {/* Header */}
      <StudioPageHeader
        eyebrow="YouTube Studio · Multi-Account Command Center"
        title="Channel Analytics & Studio Dashboard"
        subtitle="Monitor real-time subscribers, video views, Shorts vs Long-form performance, and production workspaces across all connected YouTube profiles."
        actions={
          <>
            {lastFetchedAt && (
              <span className="hidden items-center gap-1.5 rounded-xl border border-borderSoft bg-surface px-3 py-2 text-xs text-muted sm:inline-flex">
                <Clock className="h-3.5 w-3.5 text-accent" />
                Synced {formatRelativeTime(lastFetchedAt)}
              </span>
            )}
            <button
              type="button"
              aria-label="Refresh YouTube Studio stats"
              disabled={loading || refreshing}
              onClick={() => void loadAllProfiles(true)}
              className="studio-btn-ghost"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading || refreshing ? 'animate-spin text-accent' : 'text-muted'}`}
              />
              <span>{refreshing ? 'Refreshing…' : 'Refresh Stats'}</span>
            </button>
            <button
              type="button"
              onClick={onManageAccounts}
              className="studio-btn-primary"
            >
              <Settings2 className="h-4 w-4" />
              <span>Manage Accounts</span>
            </button>
          </>
        }
      />

      {error && (
        <div
          role="alert"
          className="studio-card flex items-center gap-3 border-danger/40 bg-danger/10 p-4 text-sm text-red-200"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Profile Selector Pills */}
      <div
        aria-label="Channel scope filter"
        className="studio-card flex flex-wrap items-center justify-between gap-3 p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedProfileId('all')}
            className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              selectedProfileId === 'all'
                ? 'bg-accent text-white shadow-glow'
                : 'border border-borderSoft bg-bg/60 text-muted hover:border-border hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>All Profiles ({accounts.length})</span>
          </button>

          {orderedProfiles.map((profile) => {
            const isSelected = selectedProfileId === profile.accountId;
            const displayTitle =
              profile.channel?.title ||
              profile.boundChannelTitle ||
              profile.accountName;
            const subs = profile.channel?.subscriberCount ?? 0;

            return (
              <button
                key={profile.accountId}
                type="button"
                onClick={() =>
                  setSelectedProfileId((prev) =>
                    prev === profile.accountId ? 'all' : profile.accountId,
                  )
                }
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-1.5 text-left text-xs transition-all ${
                  isSelected
                    ? 'border-accent bg-accentSoft text-white shadow-glow'
                    : 'border-borderSoft bg-bg/60 text-muted hover:border-border hover:text-white'
                }`}
              >
                <ChannelAvatar
                  avatarUrl={profile.channel?.avatar}
                  fallbackText={profile.accountAvatar || profile.accountName}
                  color={profile.accountColor}
                  size="sm"
                />
                <span className="min-w-0">
                  <span className="block max-w-[140px] truncate font-semibold text-white">
                    {displayTitle}
                  </span>
                  <span className="block truncate text-[10px] text-faint">
                    {profile.accountName} · {formatCompactNumber(subs)} subs
                  </span>
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    profile.authenticated ? 'bg-success' : 'bg-warning'
                  }`}
                  title={
                    profile.authenticated
                      ? 'YouTube Connected'
                      : 'Not Connected'
                  }
                />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {kpiSummary.connectedProfiles}/{kpiSummary.totalProfiles} Channels Connected
          </span>
        </div>
      </div>

      {/* Network / Scope KPI Summary Ribbon */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Subscribers Card */}
        <div className="studio-card relative overflow-hidden p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                Current Subscribers
              </p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">
                {loading ? '…' : formatFullNumber(kpiSummary.totalSubscribers)}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accentSoft text-accent">
              <Users className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-borderSoft pt-3 text-[11px] text-muted">
            {scopedProfiles.map((p) => (
              <span
                key={p.accountId}
                className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px]"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: p.accountColor }}
                />
                <span className="max-w-[90px] truncate text-gray-300">
                  {p.channel?.title || p.accountName}:
                </span>
                <span className="font-semibold text-white">
                  {formatCompactNumber(p.channel?.subscriberCount || 0)}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Channel Views Card */}
        <div className="studio-card relative overflow-hidden p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                Lifetime Channel Views
              </p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">
                {loading ? '…' : formatFullNumber(kpiSummary.totalViews)}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <Eye className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-borderSoft pt-3 text-xs text-muted">
            <span>
              Recent uploads:{' '}
              <strong className="text-white">
                {formatCompactNumber(kpiSummary.recentViews)}
              </strong>{' '}
              views
            </span>
            <span className="text-emerald-300">
              Avg {formatCompactNumber(kpiSummary.avgViewsPerVideo)}/video
            </span>
          </div>
        </div>

        {/* Engagement Card */}
        <div className="studio-card relative overflow-hidden p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                Audience Engagement
              </p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">
                {loading ? '…' : `${kpiSummary.engagementRate}%`}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <ThumbsUp className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-borderSoft pt-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="h-3.5 w-3.5 text-emerald-400" />
              <strong className="text-white">
                {formatFullNumber(kpiSummary.recentLikes)}
              </strong>{' '}
              likes
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
              <strong className="text-white">
                {formatFullNumber(kpiSummary.recentComments)}
              </strong>{' '}
              comments
            </span>
          </div>
        </div>

        {/* Published Videos & Workspaces Card */}
        <div className="studio-card relative overflow-hidden p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                Published Videos
              </p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">
                {loading ? '…' : formatFullNumber(kpiSummary.totalVideos)}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400">
              <Video className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-borderSoft pt-3 text-xs text-muted">
            <span>
              <strong className="text-white">{kpiSummary.shortsCount}</strong> Shorts ·{' '}
              <strong className="text-white">{kpiSummary.longCount}</strong> Long
            </span>
            <span>
              <strong className="text-accent">{kpiSummary.totalScripts}</strong> Studio scripts
            </span>
          </div>
        </div>
      </div>

      {/* All Three Profile YouTube Studio Cards */}
      <section aria-label="All Profile YouTube Studio Channels">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-muted">
            <Youtube className="h-4 w-4 text-accent" />
            Connected Profile Channels ({orderedProfiles.length})
          </h3>
          {selectedProfileId !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedProfileId('all')}
              className="text-xs font-medium text-accent hover:underline"
            >
              Show all {orderedProfiles.length} profiles
            </button>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {orderedProfiles.map((profile) => {
            const channelObj = accounts.find((a) => a.id === profile.accountId) || {
              id: profile.accountId,
              name: profile.accountName,
              color: profile.accountColor,
              avatar: profile.accountAvatar,
            };
            const isActiveWorkspace = activeAccount.id === profile.accountId;
            const isFocused = selectedProfileId === profile.accountId;
            const ch = profile.channel;
            const latest = profile.analytics.latestVideo;
            const totalRecent = profile.analytics.recentVideosCount;
            const shortsPct =
              totalRecent > 0
                ? Math.round((profile.analytics.shortsCount / totalRecent) * 100)
                : 0;
            const safeChannelUrl = safeExternalYoutubeUrl(ch?.channelUrl);
            const safeStudioUrl = safeExternalYoutubeUrl(ch?.studioUrl);

            return (
              <article
                key={profile.accountId}
                aria-label={`${profile.accountName} YouTube Studio Card`}
                className={`studio-card flex flex-col justify-between overflow-hidden transition-all ${
                  isFocused
                    ? 'ring-2 ring-accent shadow-glow'
                    : isActiveWorkspace
                    ? 'border-accent/40'
                    : ''
                }`}
              >
                <div>
                  {/* Top Banner Strip */}
                  <div
                    className="relative h-20 w-full overflow-hidden border-b border-borderSoft"
                    style={{
                      background: ch?.bannerUrl
                        ? `linear-gradient(180deg, rgba(8,9,13,0.25), rgba(8,9,13,0.88)), url(${ch.bannerUrl}) center/cover no-repeat`
                        : `linear-gradient(135deg, ${profile.accountColor}33 0%, #10131b 65%, #08090d 100%)`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-full bg-black/65 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-200 backdrop-blur-md">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: profile.accountColor }}
                          />
                          <span className="truncate">{profile.accountName}</span>
                        </span>
                        {isActiveWorkspace && (
                          <span className="shrink-0 rounded-full bg-accent/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {safeStudioUrl && (
                          <a
                            href={safeStudioUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in YouTube Studio"
                            className="inline-flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-medium text-gray-200 backdrop-blur-md transition-colors hover:bg-black/85 hover:text-white"
                          >
                            <span>YT Studio</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {safeChannelUrl && (
                          <a
                            href={safeChannelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View YouTube Channel"
                            className="inline-flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-medium text-gray-200 backdrop-blur-md transition-colors hover:bg-black/85 hover:text-white"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Channel Identity Row */}
                  <div className="px-5 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ChannelAvatar
                          avatarUrl={ch?.avatar}
                          fallbackText={profile.accountAvatar || profile.accountName}
                          color={profile.accountColor}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="truncate text-base font-bold text-white">
                              {ch?.title ||
                                profile.boundChannelTitle ||
                                profile.accountName}
                            </h4>
                          </div>
                          <p className="truncate text-xs text-muted">
                            {ch?.customUrl || 'YouTube Channel'}
                            {ch?.country ? ` · ${ch.country}` : ''}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          profile.authenticated
                            ? 'border border-success/25 bg-success/10 text-emerald-300'
                            : 'border border-warning/30 bg-warning/10 text-amber-300'
                        }`}
                      >
                        {loading && !overviews[profile.accountId] ? 'Syncing…' : profile.authenticated ? '● Live' : 'Reconnect'}
                      </span>
                    </div>

                    {/* Subscribers + Core Channel Stats */}
                    {profile.authenticated && ch ? (
                      <>
                        <div className="mt-4 rounded-xl border border-borderSoft bg-bg/70 p-3.5">
                          <div className="flex items-baseline justify-between">
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                                Current Subscribers
                              </span>
                              <span className="mt-0.5 block text-2xl font-extrabold text-white">
                                {ch.hiddenSubscriberCount
                                  ? 'Hidden'
                                  : formatFullNumber(ch.subscriberCount)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                                Lifetime Views
                              </span>
                              <span className="mt-0.5 block text-lg font-bold text-gray-100">
                                {formatFullNumber(ch.viewCount)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-borderSoft pt-3 text-center">
                            <div>
                              <span className="block text-[10px] text-faint">Videos</span>
                              <span className="text-xs font-bold text-white">
                                {formatFullNumber(ch.videoCount)}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-faint">
                                Avg Views
                              </span>
                              <span className="text-xs font-bold text-white">
                                {formatCompactNumber(
                                  profile.analytics.avgViewsPerVideo,
                                )}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-faint">
                                Engagement
                              </span>
                              <span className="text-xs font-bold text-emerald-300">
                                {profile.analytics.avgEngagementRate}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Format Mix Bar */}
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                            <span className="inline-flex items-center gap-1">
                              <Zap className="h-3 w-3 text-accent" />
                              Shorts: <strong className="text-white">{profile.analytics.shortsCount}</strong> ({formatCompactNumber(profile.analytics.shortsViews)} views)
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clapperboard className="h-3 w-3 text-blue-400" />
                              Long: <strong className="text-white">{profile.analytics.longCount}</strong> ({formatCompactNumber(profile.analytics.longViews)} views)
                            </span>
                          </div>
                          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className="bg-accent transition-all"
                              style={{ width: `${totalRecent > 0 ? shortsPct : 50}%` }}
                            />
                            <div
                              className="bg-blue-500 transition-all"
                              style={{
                                width: `${totalRecent > 0 ? 100 - shortsPct : 50}%`,
                              }}
                            />
                          </div>
                        </div>

                        {/* Latest Video Performance Card */}
                        <div className="mt-4">
                          <p className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                            <span>Latest Video Performance</span>
                            {latest && (
                              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-gray-300">
                                Rank #{latest.rankByViews} of {latest.totalCompared}
                              </span>
                            )}
                          </p>

                          {latest ? (
                            <div
                              onClick={() =>
                                setInspectedVideo({
                                  ...latest.video,
                                  accountId: profile.accountId,
                                  accountName: profile.accountName,
                                  accountColor: profile.accountColor,
                                  accountAvatar: profile.accountAvatar,
                                  channelTitle: ch.title,
                                  channelAvatar: ch.avatar,
                                  channelAvgViews: profile.analytics.avgViewsPerVideo,
                                })
                              }
                              className="group cursor-pointer rounded-xl border border-borderSoft bg-bg/60 p-3 transition-colors hover:border-border hover:bg-surface2/60"
                            >
                              <div className="flex gap-3">
                                <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                                  {latest.video.thumbnail ? (
                                    <img
                                      src={latest.video.thumbnail}
                                      alt={latest.video.title}
                                      referrerPolicy="no-referrer"
                                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-faint">
                                      <Film className="h-5 w-5" />
                                    </div>
                                  )}
                                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold text-white">
                                    {latest.video.durationFormatted}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="line-clamp-2 text-xs font-semibold leading-snug text-white group-hover:text-accent">
                                    {latest.video.title}
                                  </p>
                                  <p className="mt-1 text-[11px] text-faint">
                                    {formatRelativeTime(latest.video.publishedAt)} ·{' '}
                                    {latest.video.isShort ? 'Short' : 'Video'}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-2.5 flex items-center justify-between border-t border-borderSoft pt-2 text-[11px] text-muted">
                                <span className="inline-flex items-center gap-1">
                                  <Eye className="h-3 w-3 text-blue-400" />
                                  <strong className="text-white">
                                    {formatFullNumber(latest.video.viewCount)}
                                  </strong>
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <ThumbsUp className="h-3 w-3 text-emerald-400" />
                                  <strong className="text-white">
                                    {formatFullNumber(latest.video.likeCount)}
                                  </strong>
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3 text-purple-400" />
                                  <strong className="text-white">
                                    {formatFullNumber(latest.video.commentCount)}
                                  </strong>
                                </span>
                                <span
                                  className={`font-semibold ${
                                    latest.viewsVsAveragePct >= 0
                                      ? 'text-emerald-300'
                                      : 'text-amber-300'
                                  }`}
                                >
                                  {latest.viewsVsAveragePct >= 0 ? '+' : ''}
                                  {latest.viewsVsAveragePct}% vs avg
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-borderSoft bg-bg/40 px-4 py-5 text-center">
                              <Video className="mb-1.5 h-5 w-5 text-faint" />
                              <p className="text-xs font-medium text-gray-300">
                                No uploaded videos yet
                              </p>
                              <p className="mt-0.5 text-[11px] text-faint">
                                Create & publish your first video from this profile’s workspace.
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    ) : loading && !overviews[profile.accountId] ? (
                      <div className="mt-4 flex h-44 flex-col items-center justify-center rounded-xl border border-borderSoft bg-bg/50 p-4 text-xs text-muted">
                        <RefreshCw className="mb-2 h-5 w-5 animate-spin text-accent" />
                        <span>Loading live YouTube Studio metrics…</span>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-4 text-xs text-amber-200">
                        <p className="font-semibold">YouTube channel not connected</p>
                        <p className="mt-1 text-amber-200/80">
                          {profile.message ||
                            'Connect this profile in Profile & Voices to view live YouTube Studio analytics.'}
                        </p>
                        <button
                          type="button"
                          onClick={onManageAccounts}
                          className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Connect in Profile & Voices
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Workspace Quick-Launch & Card Footer */}
                <div className="mt-4 border-t border-borderSoft bg-bg/50 px-5 py-3.5">
                  <div className="mb-2.5 flex items-center justify-between text-[11px]">
                    <span className="font-semibold uppercase tracking-wider text-faint">
                      TubeFlow Workspaces
                    </span>
                    <span className="text-muted">
                      {profile.workspaces.totalScripts} scripts
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'shorts', label: 'Shorts', count: profile.workspaces.shorts.scriptCount },
                        { id: 'long', label: 'Long', count: profile.workspaces.long.scriptCount },
                        { id: 'mixed', label: 'Mixed', count: profile.workspaces.mixed.scriptCount },
                      ] as const
                    ).map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => onOpenWorkspace(channelObj, w.id)}
                        className="flex items-center justify-between rounded-lg border border-borderSoft bg-surface px-2.5 py-1.5 text-[11px] font-medium text-gray-300 transition-colors hover:border-accent/40 hover:bg-surface2 hover:text-white"
                      >
                        <span>{w.label}</span>
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.2 text-[10px] font-bold text-white">
                          {w.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedProfileId((prev) =>
                          prev === profile.accountId ? 'all' : profile.accountId,
                        )
                      }
                      className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                        isFocused
                          ? 'border-accent bg-accent text-white'
                          : 'border-border bg-surface text-gray-200 hover:bg-surface2 hover:text-white'
                      }`}
                    >
                      {isFocused ? 'Showing This Channel' : 'Focus Analytics'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectAccount(channelObj)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                        isActiveWorkspace
                          ? 'border-success/30 bg-success/10 text-emerald-300'
                          : 'border-border bg-bg text-muted hover:text-white'
                      }`}
                    >
                      {isActiveWorkspace ? 'Active' : 'Use Account'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Deep-Dive Studio Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borderSoft pb-3">
        <div role="tablist" aria-label="Studio sections" className="flex flex-wrap gap-2">
          {(
            [
              { id: 'analytics', label: 'Analytics & Top Videos', icon: BarChart3 },
              {
                id: 'content',
                label: `Content Library (${allEnrichedVideos.length})`,
                icon: Film,
              },
              {
                id: 'comparison',
                label: '3-Channel Comparison',
                icon: Activity,
              },
              {
                id: 'workspaces',
                label: 'Production Workspaces',
                icon: Layers,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = subTab === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setSubTab(item.id)}
                className={
                  active
                    ? 'studio-tab-btn bg-accent text-white shadow-glow'
                    : 'studio-tab-btn border border-borderSoft bg-surface text-muted hover:text-white'
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SUB-TAB 1: ANALYTICS & TOP VIDEOS */}
      {subTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Recent Uploads Views Chart */}
            <div className="studio-card p-5 lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="flex items-center gap-2 text-base font-bold text-white">
                    <TrendingUp className="h-4 w-4 text-accent" />
                    Recent Uploads Views & Velocity
                  </h4>
                  <p className="text-xs text-muted">
                    Views across the latest {chartVideos.length} published videos (click any bar to inspect video analytics)
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-accent" />
                    Shorts
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                    Long Video
                  </span>
                </div>
              </div>

              {chartVideos.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex h-52 items-end gap-2 rounded-xl border border-borderSoft bg-bg/60 px-4 pb-3 pt-6">
                    {chartVideos.map((v) => {
                      const heightPct = Math.max(
                        8,
                        Math.round((v.viewCount / maxChartViews) * 100),
                      );
                      return (
                        <button
                          key={`${v.accountId}:${v.id}`}
                          type="button"
                          onClick={() => setInspectedVideo(v)}
                          title={`${v.title} (${formatFullNumber(v.viewCount)} views · ${v.channelTitle})`}
                          className="group relative flex h-full flex-1 flex-col items-center justify-end"
                        >
                          <span className="mb-1 hidden text-[10px] font-bold text-white group-hover:block">
                            {formatCompactNumber(v.viewCount)}
                          </span>
                          <div
                            className={`w-full rounded-t-md transition-all group-hover:brightness-125 ${
                              v.isShort
                                ? 'bg-gradient-to-t from-accent/70 to-accent'
                                : 'bg-gradient-to-t from-blue-600/70 to-blue-400'
                            }`}
                            style={{ height: `${heightPct}%` }}
                          />
                          <span
                            className="mt-1.5 h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: v.accountColor }}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-borderSoft bg-bg/50 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-faint">
                        Analyzed Uploads
                      </span>
                      <span className="mt-1 block text-lg font-bold text-white">
                        {kpiSummary.recentVideosCount}
                      </span>
                    </div>
                    <div className="rounded-xl border border-borderSoft bg-bg/50 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-faint">
                        Recent Views
                      </span>
                      <span className="mt-1 block text-lg font-bold text-white">
                        {formatFullNumber(kpiSummary.recentViews)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-borderSoft bg-bg/50 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-faint">
                        Avg Views / Upload
                      </span>
                      <span className="mt-1 block text-lg font-bold text-emerald-300">
                        {formatFullNumber(kpiSummary.avgViewsPerVideo)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-borderSoft bg-bg/50 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-faint">
                        Likes + Comments
                      </span>
                      <span className="mt-1 block text-lg font-bold text-white">
                        {formatFullNumber(
                          kpiSummary.recentLikes + kpiSummary.recentComments,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-borderSoft bg-bg/40 text-center">
                  <BarChart3 className="mb-2 h-7 w-7 text-faint" />
                  <p className="text-sm font-medium text-gray-300">
                    No video analytics to chart yet
                  </p>
                </div>
              )}
            </div>

            {/* Format Breakdown Card: Shorts vs Long Videos */}
            <div className="studio-card flex flex-col justify-between p-5">
              <div>
                <h4 className="flex items-center gap-2 text-base font-bold text-white">
                  <Flame className="h-4 w-4 text-accent" />
                  Shorts vs Long-Form Mix
                </h4>
                <p className="mt-1 text-xs text-muted">
                  Performance split by video format across selected channels
                </p>

                <div className="mt-4 space-y-4">
                  {/* Shorts Block */}
                  <div className="rounded-xl border border-accent/25 bg-accentSoft/40 p-4">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
                        <Zap className="h-4 w-4 text-accent" />
                        YouTube Shorts (9:16)
                      </span>
                      <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">
                        {kpiSummary.shortsCount} videos
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="block text-[10px] text-faint">Views</span>
                        <span className="font-bold text-white">
                          {formatFullNumber(kpiSummary.shortsViews)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-faint">Avg Views</span>
                        <span className="font-bold text-white">
                          {kpiSummary.shortsCount > 0
                            ? formatCompactNumber(
                                Math.round(
                                  kpiSummary.shortsViews / kpiSummary.shortsCount,
                                ),
                              )
                            : '0'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-faint">Likes</span>
                        <span className="font-bold text-emerald-300">
                          {formatFullNumber(kpiSummary.shortsLikes)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Long Video Block */}
                  <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-4">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
                        <Clapperboard className="h-4 w-4 text-blue-400" />
                        Long Videos (16:9)
                      </span>
                      <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-bold text-blue-300">
                        {kpiSummary.longCount} videos
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="block text-[10px] text-faint">Views</span>
                        <span className="font-bold text-white">
                          {formatFullNumber(kpiSummary.longViews)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-faint">Avg Views</span>
                        <span className="font-bold text-white">
                          {kpiSummary.longCount > 0
                            ? formatCompactNumber(
                                Math.round(
                                  kpiSummary.longViews / kpiSummary.longCount,
                                ),
                              )
                            : '0'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-faint">Likes</span>
                        <span className="font-bold text-emerald-300">
                          {formatFullNumber(kpiSummary.longLikes)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-borderSoft bg-bg/60 p-3 text-xs text-muted">
                <span className="font-semibold text-white">Studio Insight: </span>
                {kpiSummary.shortsViews >= kpiSummary.longViews
                  ? 'Shorts drive the majority of recent channel views. Keep pairing high-retention hooks with daily Short uploads.'
                  : 'Long-form videos are generating strong session views across your connected channels.'}
              </div>
            </div>
          </div>

          {/* Top Performing Content Leaderboard */}
          <div className="studio-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="flex items-center gap-2 text-base font-bold text-white">
                  <Award className="h-4 w-4 text-amber-400" />
                  Top Performing Videos by Views
                </h4>
                <p className="text-xs text-muted">
                  Highest-performing uploads ranked by total views and audience engagement
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('content')}
                className="text-xs font-semibold text-accent hover:underline"
              >
                View all {allEnrichedVideos.length} videos →
              </button>
            </div>

            {topVideosAcrossScope.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {topVideosAcrossScope.map((video, idx) => {
                  const safeWatchUrl = safeExternalYoutubeUrl(video.url);
                  return (
                    <div
                      key={`${video.accountId}:${video.id}`}
                      onClick={() => setInspectedVideo(video)}
                      className="group flex cursor-pointer flex-col justify-between rounded-xl border border-borderSoft bg-bg/60 p-3.5 transition-all hover:border-border hover:bg-surface2/60"
                    >
                      <div className="flex gap-3">
                        <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-black">
                          {video.thumbnail ? (
                            <img
                              src={video.thumbnail}
                              alt={video.title}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-faint">
                              <Film className="h-5 w-5" />
                            </div>
                          )}
                          <span className="absolute left-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow">
                            #{idx + 1}
                          </span>
                          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold text-white">
                            {video.durationFormatted}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: video.accountColor }}
                            />
                            <span className="truncate text-[10px] font-semibold text-muted">
                              {video.channelTitle}
                            </span>
                            {video.isShort && (
                              <span className="rounded bg-accent/15 px-1.5 py-0.2 text-[9px] font-bold text-accent">
                                SHORT
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-2 text-xs font-semibold leading-snug text-white group-hover:text-accent">
                            {video.title}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-borderSoft pt-2.5 text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1 font-semibold text-white">
                          <Eye className="h-3.5 w-3.5 text-blue-400" />
                          {formatFullNumber(video.viewCount)} views
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3 text-emerald-400" />
                          {formatFullNumber(video.likeCount)}
                        </span>
                        <span className="text-emerald-300">
                          {video.engagementRate}% eng.
                        </span>
                        {safeWatchUrl && (
                          <a
                            href={safeWatchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-accent hover:underline"
                          >
                            <span>Watch</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted">
                No published videos found in the selected scope.
              </p>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CONTENT LIBRARY (YOUTUBE STUDIO TABLE) */}
      {subTab === 'content' && (
        <div className="studio-card overflow-hidden">
          {/* Filters Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borderSoft p-4">
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                type="search"
                aria-label="Search channel videos"
                placeholder="Filter videos by title or keyword…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="studio-input !pl-9 !py-2 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Format Filter */}
              <div className="flex items-center rounded-xl border border-borderSoft bg-bg p-1">
                {(
                  [
                    { id: 'all', label: 'All Formats' },
                    { id: 'shorts', label: 'Shorts' },
                    { id: 'long', label: 'Long Videos' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormatFilter(f.id)}
                    className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                      formatFilter === f.id
                        ? 'bg-accent text-white'
                        : 'text-muted hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Privacy Filter */}
              <select
                aria-label="Filter by visibility"
                value={privacyFilter}
                onChange={(e) => setPrivacyFilter(e.target.value as PrivacyFilter)}
                className="rounded-xl border border-borderSoft bg-bg px-3 py-2 text-xs text-gray-200 outline-none"
              >
                <option value="all">Visibility: All</option>
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>

              {/* Sort By */}
              <select
                aria-label="Sort videos by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="rounded-xl border border-borderSoft bg-bg px-3 py-2 text-xs text-gray-200 outline-none"
              >
                <option value="date">Sort: Newest First</option>
                <option value="views">Sort: Most Views</option>
                <option value="likes">Sort: Most Likes</option>
                <option value="comments">Sort: Most Comments</option>
                <option value="engagement">Sort: Engagement Rate</option>
              </select>
            </div>
          </div>

          {/* YouTube Studio Content Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-borderSoft bg-bg/50 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                  <th className="px-4 py-3">Video</th>
                  <th className="px-3 py-3">Channel / Profile</th>
                  <th className="px-3 py-3">Visibility</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-right">Views</th>
                  <th className="px-3 py-3 text-right">Comments</th>
                  <th className="px-3 py-3 text-right">Likes & Engagement</th>
                  <th className="px-4 py-3 text-right">Studio Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSoft">
                {filteredVideos.map((video) => {
                  const safeWatchUrl = safeExternalYoutubeUrl(video.url);
                  const safeEditUrl = safeExternalYoutubeUrl(video.studioUrl);
                  return (
                    <tr
                      key={`${video.accountId}:${video.id}`}
                      onClick={() => setInspectedVideo(video)}
                      className="group cursor-pointer transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="max-w-[310px] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                            {video.thumbnail ? (
                              <img
                                src={video.thumbnail}
                                alt={video.title}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-faint">
                                <Film className="h-4 w-4" />
                              </div>
                            )}
                            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold text-white">
                              {video.durationFormatted}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {video.isShort && (
                                <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                                  SHORT
                                </span>
                              )}
                              <p className="truncate font-semibold text-white group-hover:text-accent">
                                {video.title}
                              </p>
                            </div>
                            <p className="mt-1 line-clamp-1 text-[11px] text-faint">
                              {video.description || 'No description'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <ChannelAvatar
                            avatarUrl={video.channelAvatar}
                            fallbackText={video.accountAvatar || video.accountName}
                            color={video.accountColor}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-200">
                              {video.channelTitle}
                            </p>
                            <p className="truncate text-[10px] text-faint">
                              {video.accountName}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        {video.publishAt && Date.parse(video.publishAt) > Date.now() ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                              <Clock className="h-3 w-3" />
                              Scheduled
                            </span>
                            <span className="block text-[10px] text-faint">
                              {formatShortDate(video.publishAt)}
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                              video.privacyStatus === 'public'
                                ? 'bg-success/10 text-emerald-300'
                                : video.privacyStatus === 'unlisted'
                                ? 'bg-amber-500/10 text-amber-300'
                                : 'bg-white/10 text-gray-300'
                            }`}
                          >
                            {video.privacyStatus === 'public' ? (
                              <Globe className="h-3 w-3" />
                            ) : (
                              <Lock className="h-3 w-3" />
                            )}
                            {video.privacyStatus}
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-muted">
                        <span className="block text-gray-200">
                          {formatShortDate(video.publishedAt)}
                        </span>
                        <span className="text-[10px] text-faint">
                          {formatRelativeTime(video.publishedAt)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-white">
                        {formatFullNumber(video.viewCount)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right text-gray-200">
                        {formatFullNumber(video.commentCount)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <span className="block font-semibold text-white">
                          {formatFullNumber(video.likeCount)} likes
                        </span>
                        <span className="text-[10px] text-emerald-300">
                          {video.engagementRate}% engagement
                        </span>
                      </td>

                      <td
                        className="whitespace-nowrap px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {safeWatchUrl && (
                            <a
                              href={safeWatchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg border border-borderSoft bg-bg px-2.5 py-1 text-[11px] font-medium text-gray-200 hover:border-border hover:text-white"
                            >
                              Watch
                            </a>
                          )}
                          {safeEditUrl && (
                            <a
                              href={safeEditUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg border border-borderSoft bg-bg px-2.5 py-1 text-[11px] font-medium text-accent hover:border-accent/40"
                            >
                              Studio
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredVideos.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-muted">
                      No videos match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: 3-CHANNEL COMPARISON MATRIX */}
      {subTab === 'comparison' && (
        <div className="studio-card overflow-hidden p-5">
          <div className="mb-4">
            <h4 className="text-base font-bold text-white">
              Multi-Account YouTube Studio Comparison
            </h4>
            <p className="text-xs text-muted">
              Side-by-side benchmark across all {orderedProfiles.length} YouTube accounts
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-borderSoft bg-bg/50 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                  <th className="px-4 py-3">Metric</th>
                  {orderedProfiles.map((p) => (
                    <th key={p.accountId} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ChannelAvatar
                          avatarUrl={p.channel?.avatar}
                          fallbackText={p.accountAvatar || p.accountName}
                          color={p.accountColor}
                          size="sm"
                        />
                        <div>
                          <span className="block text-xs font-bold text-white normal-case">
                            {p.channel?.title || p.boundChannelTitle || p.accountName}
                          </span>
                          <span className="block text-[10px] font-normal text-faint normal-case">
                            Profile: {p.accountName}
                          </span>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSoft">
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">YouTube Handle</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3 font-mono text-gray-200">
                      {p.channel?.customUrl || '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">Connection Status</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          p.authenticated
                            ? 'bg-success/10 text-emerald-300'
                            : 'bg-warning/10 text-amber-300'
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {p.authenticated ? 'Connected' : 'Not Connected'}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">Subscribers</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3 text-sm font-extrabold text-white">
                      {formatFullNumber(p.channel?.subscriberCount || 0)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">Lifetime Channel Views</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3 text-sm font-bold text-white">
                      {formatFullNumber(p.channel?.viewCount || 0)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">Published Videos</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3 font-bold text-gray-200">
                      {formatFullNumber(p.channel?.videoCount || 0)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">Avg Views / Video (Recent)</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3 font-bold text-emerald-300">
                      {formatFullNumber(p.analytics.avgViewsPerVideo)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">Recent Likes / Comments</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3 text-gray-200">
                      {formatFullNumber(p.analytics.recentLikes)} likes ·{' '}
                      {formatFullNumber(p.analytics.recentComments)} comments
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">Engagement Rate</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3 font-semibold text-accent">
                      {p.analytics.avgEngagementRate}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">Shorts vs Long Videos</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3 text-gray-200">
                      {p.analytics.shortsCount} Shorts · {p.analytics.longCount} Long
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-muted">TubeFlow Workspace Scripts</td>
                  {orderedProfiles.map((p) => (
                    <td key={p.accountId} className="px-4 py-3 text-gray-200">
                      <strong>{p.workspaces.totalScripts}</strong> total ({p.workspaces.shorts.scriptCount} Shorts, {p.workspaces.long.scriptCount} Long, {p.workspaces.mixed.scriptCount} Mixed)
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: PRODUCTION WORKSPACES */}
      {subTab === 'workspaces' && (
        <div className="grid gap-5 lg:grid-cols-3">
          {orderedProfiles.map((profile) => {
            const channelObj = accounts.find((a) => a.id === profile.accountId) || {
              id: profile.accountId,
              name: profile.accountName,
              color: profile.accountColor,
              avatar: profile.accountAvatar,
            };
            return (
              <div key={profile.accountId} className="studio-card p-5">
                <div className="flex items-center gap-3 border-b border-borderSoft pb-4">
                  <ChannelAvatar
                    avatarUrl={profile.channel?.avatar}
                    fallbackText={profile.accountAvatar || profile.accountName}
                    color={profile.accountColor}
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-bold text-white">
                      {profile.channel?.title || profile.accountName}
                    </h4>
                    <p className="truncate text-xs text-muted">
                      Profile: {profile.accountName} · {profile.workspaces.totalScripts} scripts
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {(
                    [
                      {
                        id: 'shorts' as Section,
                        title: 'Shorts Workspace (9:16)',
                        icon: Zap,
                        stats: profile.workspaces.shorts,
                      },
                      {
                        id: 'long' as Section,
                        title: 'Long Video Workspace (16:9)',
                        icon: Clapperboard,
                        stats: profile.workspaces.long,
                      },
                      {
                        id: 'mixed' as Section,
                        title: 'Mixed Media Workspace',
                        icon: Layers,
                        stats: profile.workspaces.mixed,
                      },
                    ]
                  ).map((wsItem) => {
                    const Icon = wsItem.icon;
                    return (
                      <div
                        key={wsItem.id}
                        className="flex items-center justify-between rounded-xl border border-borderSoft bg-bg/60 p-3.5"
                      >
                        <div>
                          <p className="flex items-center gap-2 text-xs font-semibold text-white">
                            <Icon className="h-3.5 w-3.5 text-accent" />
                            {wsItem.title}
                          </p>
                          <p className="mt-1 text-[11px] text-muted">
                            {wsItem.stats.scriptCount} scripts ·{' '}
                            {wsItem.stats.renderedCount} rendered MP4s
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenWorkspace(channelObj, wsItem.id)}
                          className="studio-btn-ghost !px-3 !py-1.5 !text-xs"
                        >
                          Open
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Analytics Detail Modal */}
      {inspectedVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Video Analytics Details"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setInspectedVideo(null)}
        >
          <div
            className="studio-card max-h-[88vh] w-full max-w-2xl overflow-y-auto p-6 shadow-pop animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-borderSoft pb-4">
              <div className="flex items-center gap-2.5">
                <ChannelAvatar
                  avatarUrl={inspectedVideo.channelAvatar}
                  fallbackText={inspectedVideo.accountAvatar || inspectedVideo.accountName}
                  color={inspectedVideo.accountColor}
                  size="sm"
                />
                <div>
                  <p className="text-xs font-bold text-white">
                    {inspectedVideo.channelTitle}
                  </p>
                  <p className="text-[11px] text-faint">
                    Profile: {inspectedVideo.accountName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close video analytics"
                onClick={() => setInspectedVideo(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row">
              <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-xl bg-black sm:w-60">
                {inspectedVideo.thumbnail ? (
                  <img
                    src={inspectedVideo.thumbnail}
                    alt={inspectedVideo.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-faint">
                    <Film className="h-8 w-8" />
                  </div>
                )}
                <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {inspectedVideo.durationFormatted}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
                    {inspectedVideo.isShort ? 'YouTube Short' : 'Long Video'}
                  </span>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-200">
                    {inspectedVideo.privacyStatus}
                  </span>
                  <span className="text-xs text-muted">
                    Published {formatShortDate(inspectedVideo.publishedAt)}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-bold leading-snug text-white">
                  {inspectedVideo.title}
                </h3>
                <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-muted">
                  {inspectedVideo.description || 'No description provided.'}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-borderSoft bg-bg p-3">
                <span className="block text-[10px] uppercase tracking-wider text-faint">
                  Views
                </span>
                <span className="mt-1 block text-lg font-extrabold text-white">
                  {formatFullNumber(inspectedVideo.viewCount)}
                </span>
              </div>
              <div className="rounded-xl border border-borderSoft bg-bg p-3">
                <span className="block text-[10px] uppercase tracking-wider text-faint">
                  Likes
                </span>
                <span className="mt-1 block text-lg font-extrabold text-emerald-300">
                  {formatFullNumber(inspectedVideo.likeCount)}
                </span>
              </div>
              <div className="rounded-xl border border-borderSoft bg-bg p-3">
                <span className="block text-[10px] uppercase tracking-wider text-faint">
                  Comments
                </span>
                <span className="mt-1 block text-lg font-extrabold text-white">
                  {formatFullNumber(inspectedVideo.commentCount)}
                </span>
              </div>
              <div className="rounded-xl border border-borderSoft bg-bg p-3">
                <span className="block text-[10px] uppercase tracking-wider text-faint">
                  Engagement Rate
                </span>
                <span className="mt-1 block text-lg font-extrabold text-accent">
                  {inspectedVideo.engagementRate}%
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-borderSoft pt-4">
              {safeExternalYoutubeUrl(inspectedVideo.url) && (
                <a
                  href={safeExternalYoutubeUrl(inspectedVideo.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="studio-btn-ghost"
                >
                  <Play className="h-4 w-4" />
                  <span>Watch on YouTube</span>
                </a>
              )}
              {safeExternalYoutubeUrl(inspectedVideo.studioUrl) && (
                <a
                  href={safeExternalYoutubeUrl(inspectedVideo.studioUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="studio-btn-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Open in YouTube Studio</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
