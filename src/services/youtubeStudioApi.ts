import type { Channel, Section } from "../data";
import { createWorkspaceFetch } from "./workspaceApi";

export interface StudioVideoItem {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
  durationIso: string;
  durationSeconds: number;
  durationFormatted: string;
  isShort: boolean;
  privacyStatus: "public" | "unlisted" | "private";
  publishAt?: string;
  madeForKids: boolean;
  definition: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  engagementRate: number;
  url: string;
  studioUrl: string;
}

export interface LatestVideoPerformance {
  video: StudioVideoItem;
  rankByViews: number;
  totalCompared: number;
  viewsVsAveragePct: number;
}

export interface StudioAnalyticsSummary {
  recentVideosCount: number;
  recentViews: number;
  recentLikes: number;
  recentComments: number;
  avgViewsPerVideo: number;
  avgLikesPerVideo: number;
  avgCommentsPerVideo: number;
  avgEngagementRate: number;
  shortsCount: number;
  shortsViews: number;
  shortsLikes: number;
  longCount: number;
  longViews: number;
  longLikes: number;
  viewsLast7Days: number;
  viewsLast28Days: number;
  uploadsLast7Days: number;
  uploadsLast28Days: number;
  latestVideo: LatestVideoPerformance | null;
  topVideos: StudioVideoItem[];
}

export interface ProfileWorkspaceStats {
  profile: Section;
  scriptCount: number;
  activeCount: number;
  renderedCount: number;
  uploadedCount: number;
}

export interface AccountWorkspaceSummary {
  shorts: ProfileWorkspaceStats;
  long: ProfileWorkspaceStats;
  mixed: ProfileWorkspaceStats;
  totalScripts: number;
  totalActive: number;
  totalRendered: number;
  totalUploaded: number;
}

export interface StudioChannelDetails {
  id: string;
  title: string;
  customUrl: string;
  description: string;
  publishedAt: string;
  country: string;
  avatar: string;
  bannerUrl: string;
  subscriberCount: number;
  hiddenSubscriberCount: boolean;
  viewCount: number;
  videoCount: number;
  uploadsPlaylistId: string;
  channelUrl: string;
  studioUrl: string;
}

export interface AccountStudioOverview {
  accountId: string;
  accountName: string;
  accountColor: string;
  accountAvatar: string;
  boundChannelId: string | null;
  boundChannelTitle: string | null;
  configured: boolean;
  authenticated: boolean;
  credentialSource: "account" | "shared" | "env" | "none";
  message?: string;
  fetchedAt: string;
  channel: StudioChannelDetails | null;
  videos: StudioVideoItem[];
  analytics: StudioAnalyticsSummary;
  workspaces: AccountWorkspaceSummary;
}

function emptyAnalytics(): StudioAnalyticsSummary {
  return {
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
  };
}

function emptyWorkspaces(): AccountWorkspaceSummary {
  return {
    shorts: { profile: "shorts", scriptCount: 0, activeCount: 0, renderedCount: 0, uploadedCount: 0 },
    long: { profile: "long", scriptCount: 0, activeCount: 0, renderedCount: 0, uploadedCount: 0 },
    mixed: { profile: "mixed", scriptCount: 0, activeCount: 0, renderedCount: 0, uploadedCount: 0 },
    totalScripts: 0,
    totalActive: 0,
    totalRendered: 0,
    totalUploaded: 0,
  };
}

export function safeExternalYoutubeUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return null;
    const allowedHosts = new Set([
      "www.youtube.com",
      "youtube.com",
      "youtu.be",
      "studio.youtube.com",
    ]);
    if (!allowedHosts.has(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function fetchProfileYouTubeStudio(
  account: Channel,
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {},
): Promise<AccountStudioOverview> {
  const doFetch = createWorkspaceFetch(account.id, "shorts");
  const query = options.forceRefresh ? "?refresh=1" : "";

  try {
    const response = await doFetch(`/api/youtube/studio${query}`, {
      signal: options.signal,
    });
    if (response.ok) {
      const data = (await response.json()) as Partial<AccountStudioOverview>;
      if (data && typeof data === "object" && "authenticated" in data) {
        return {
          accountId: account.id,
          accountName: data.accountName || account.name,
          accountColor: data.accountColor || account.color,
          accountAvatar: data.accountAvatar || account.avatar,
          boundChannelId: data.boundChannelId ?? account.youtubeChannelId ?? null,
          boundChannelTitle: data.boundChannelTitle ?? account.youtubeChannelTitle ?? null,
          configured: Boolean(data.configured),
          authenticated: Boolean(data.authenticated),
          credentialSource: data.credentialSource || "none",
          message: data.message,
          fetchedAt: data.fetchedAt || new Date().toISOString(),
          channel: data.channel || null,
          videos: Array.isArray(data.videos) ? data.videos : [],
          analytics: data.analytics || emptyAnalytics(),
          workspaces: data.workspaces || emptyWorkspaces(),
        };
      }
    }
  } catch (err) {
    if (options.signal?.aborted) throw err;
  }

  // Fallback to /api/youtube/status per profile if /studio is unavailable
  const statusRes = await doFetch("/api/youtube/status", {
    signal: options.signal,
  });
  if (!statusRes.ok) {
    throw new Error(`Could not load YouTube status for ${account.name}`);
  }
  const statusData = (await statusRes.json()) as {
    configured?: boolean;
    authenticated?: boolean;
    message?: string;
    channel?: {
      id?: string;
      title?: string;
      customUrl?: string;
      avatar?: string;
      subscriberCount?: string | number;
      videoCount?: string | number;
      viewCount?: string | number;
    } | null;
  };

  const ch = statusData.channel;
  return {
    accountId: account.id,
    accountName: account.name,
    accountColor: account.color,
    accountAvatar: account.avatar,
    boundChannelId: ch?.id || account.youtubeChannelId || null,
    boundChannelTitle: ch?.title || account.youtubeChannelTitle || null,
    configured: Boolean(statusData.configured),
    authenticated: Boolean(statusData.authenticated),
    credentialSource: statusData.configured ? "account" : "none",
    message: statusData.message,
    fetchedAt: new Date().toISOString(),
    channel: ch
      ? {
          id: ch.id || "",
          title: ch.title || account.youtubeChannelTitle || account.name,
          customUrl: ch.customUrl || "",
          description: "",
          publishedAt: "",
          country: "",
          avatar: ch.avatar || "",
          bannerUrl: "",
          subscriberCount: Number(ch.subscriberCount || 0),
          hiddenSubscriberCount: false,
          viewCount: Number(ch.viewCount || 0),
          videoCount: Number(ch.videoCount || 0),
          uploadsPlaylistId: "",
          channelUrl: ch.id ? `https://www.youtube.com/channel/${ch.id}` : "https://www.youtube.com",
          studioUrl: ch.id ? `https://studio.youtube.com/channel/${ch.id}` : "https://studio.youtube.com",
        }
      : null,
    videos: [],
    analytics: emptyAnalytics(),
    workspaces: emptyWorkspaces(),
  };
}
