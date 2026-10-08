import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import {
  ROOT_DATA,
  accountDir,
  currentWorkspace,
  type VideoProfile,
} from "./workspace.js";
import {
  bindChannel,
  connectionRevision,
  createOAuth2Client,
  credentialInfo,
  storedCredentials,
} from "./youtube-auth.js";
import {
  getAccount,
  listAccounts,
  tokenPath,
  type Account,
} from "./accounts.js";
import { containedFile } from "./paths.js";

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
  profile: VideoProfile;
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

const STUDIO_CACHE_TTL_MS = 60_000;
const studioCache = new Map<
  string,
  { expiresAt: number; revision: number; data: AccountStudioOverview }
>();

export function parseIsoDurationSeconds(iso = ""): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso.trim());
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatDurationSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

function resolveProfileDir(accountId: string, profile: VideoProfile): string {
  if (accountId === "default" && profile === "shorts") {
    return ROOT_DATA;
  }
  return containedFile(accountDir(accountId), "profiles", profile);
}

function readProfileWorkspaceStats(
  accountId: string,
  profile: VideoProfile,
): ProfileWorkspaceStats {
  const dir = resolveProfileDir(accountId, profile);
  let scriptCount = 0;
  let activeCount = 0;
  let renderedCount = 0;
  let uploadedCount = 0;

  const scriptsFile = path.join(dir, "scripts.json");
  if (fs.existsSync(scriptsFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(scriptsFile, "utf8"));
      if (Array.isArray(parsed)) {
        scriptCount = parsed.length;
        for (const item of parsed) {
          if (item && typeof item === "object") {
            if ((item as { status?: string }).status === "active") {
              activeCount += 1;
            }
            const ytExport = (item as { youtubeExport?: { videoId?: string; uploadedVideoId?: string } }).youtubeExport;
            if (ytExport?.videoId || ytExport?.uploadedVideoId) {
              uploadedCount += 1;
            }
          }
        }
      }
    } catch {
      // Ignore unreadable or empty local script store
    }
  }

  const outDir = path.join(dir, "output");
  if (fs.existsSync(outDir)) {
    try {
      const entries = fs.readdirSync(outDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const subDir = path.join(outDir, entry.name);
        const files = fs.readdirSync(subDir);
        if (files.some((f) => f.endsWith(".mp4") && !f.endsWith(".partial.mp4"))) {
          renderedCount += 1;
        }
        const uploadReceipts = files.filter((f) => /^upload_.*\.json$/i.test(f)).length;
        if (uploadReceipts > uploadedCount) {
          uploadedCount = uploadReceipts;
        }
      }
    } catch {
      // Ignore unreadable output directory
    }
  }

  return { profile, scriptCount, activeCount, renderedCount, uploadedCount };
}

export function getAccountWorkspaceSummary(accountId: string): AccountWorkspaceSummary {
  const shorts = readProfileWorkspaceStats(accountId, "shorts");
  const long = readProfileWorkspaceStats(accountId, "long");
  const mixed = readProfileWorkspaceStats(accountId, "mixed");
  return {
    shorts,
    long,
    mixed,
    totalScripts: shorts.scriptCount + long.scriptCount + mixed.scriptCount,
    totalActive: shorts.activeCount + long.activeCount + mixed.activeCount,
    totalRendered: shorts.renderedCount + long.renderedCount + mixed.renderedCount,
    totalUploaded: shorts.uploadedCount + long.uploadedCount + mixed.uploadedCount,
  };
}

function computeAnalytics(videos: StudioVideoItem[]): StudioAnalyticsSummary {
  if (!videos.length) return emptyAnalytics();

  const now = Date.now();
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms28d = 28 * 24 * 60 * 60 * 1000;

  let recentViews = 0;
  let recentLikes = 0;
  let recentComments = 0;
  let shortsCount = 0;
  let shortsViews = 0;
  let shortsLikes = 0;
  let longCount = 0;
  let longViews = 0;
  let longLikes = 0;
  let viewsLast7Days = 0;
  let viewsLast28Days = 0;
  let uploadsLast7Days = 0;
  let uploadsLast28Days = 0;

  for (const video of videos) {
    recentViews += video.viewCount;
    recentLikes += video.likeCount;
    recentComments += video.commentCount;

    if (video.isShort) {
      shortsCount += 1;
      shortsViews += video.viewCount;
      shortsLikes += video.likeCount;
    } else {
      longCount += 1;
      longViews += video.viewCount;
      longLikes += video.likeCount;
    }

    const publishedMs = Date.parse(video.publishedAt);
    if (!Number.isNaN(publishedMs)) {
      const age = now - publishedMs;
      if (age <= ms7d) {
        viewsLast7Days += video.viewCount;
        uploadsLast7Days += 1;
      }
      if (age <= ms28d) {
        viewsLast28Days += video.viewCount;
        uploadsLast28Days += 1;
      }
    }
  }

  const count = videos.length;
  const avgViewsPerVideo = Math.round(recentViews / count);
  const avgLikesPerVideo = Math.round(recentLikes / count);
  const avgCommentsPerVideo = Math.round((recentComments / count) * 10) / 10;
  const avgEngagementRate =
    recentViews > 0
      ? Number((((recentLikes + recentComments) / recentViews) * 100).toFixed(2))
      : 0;

  const sortedByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount);
  const sortedByDate = [...videos].sort(
    (a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0),
  );

  const newest = sortedByDate[0] || null;
  let latestVideo: LatestVideoPerformance | null = null;
  if (newest) {
    const rankIndex = sortedByViews.findIndex((item) => item.id === newest.id);
    const rankByViews = rankIndex >= 0 ? rankIndex + 1 : count;
    const viewsVsAveragePct =
      avgViewsPerVideo > 0
        ? Math.round(((newest.viewCount - avgViewsPerVideo) / avgViewsPerVideo) * 100)
        : 0;
    latestVideo = {
      video: newest,
      rankByViews,
      totalCompared: count,
      viewsVsAveragePct,
    };
  }

  return {
    recentVideosCount: count,
    recentViews,
    recentLikes,
    recentComments,
    avgViewsPerVideo,
    avgLikesPerVideo,
    avgCommentsPerVideo,
    avgEngagementRate,
    shortsCount,
    shortsViews,
    shortsLikes,
    longCount,
    longViews,
    longLikes,
    viewsLast7Days,
    viewsLast28Days,
    uploadsLast7Days,
    uploadsLast28Days,
    latestVideo,
    topVideos: sortedByViews.slice(0, 6),
  };
}

export async function fetchAccountStudioOverview(
  accountId = currentWorkspace().accountId,
  options: { forceRefresh?: boolean } = {},
): Promise<AccountStudioOverview> {
  const account: Account | undefined = getAccount(accountId);
  if (!account) {
    throw new Error("Unknown YouTube account");
  }

  const revision = connectionRevision(accountId);
  const cached = studioCache.get(accountId);
  if (
    !options.forceRefresh &&
    cached &&
    cached.revision === revision &&
    cached.expiresAt > Date.now()
  ) {
    return {
      ...cached.data,
      accountName: account.name,
      accountColor: account.color,
      accountAvatar: account.avatar,
       workspaces: getAccountWorkspaceSummary(accountId),
    };
  }

  const workspaces = getAccountWorkspaceSummary(accountId);
  const credInfo = credentialInfo(accountId);
  const configured = !!storedCredentials(accountId);
  const client = createOAuth2Client(accountId);

  if (!configured || !client || !fs.existsSync(tokenPath(accountId))) {
    return {
      accountId: account.id,
      accountName: account.name,
      accountColor: account.color,
      accountAvatar: account.avatar,
      boundChannelId: account.youtubeChannelId || null,
      boundChannelTitle: account.youtubeChannelTitle || null,
      configured,
      authenticated: false,
      credentialSource: credInfo.source,
      message: configured
        ? "YouTube channel not connected yet. Connect your channel to view Studio analytics."
        : "Google OAuth Client ID and Secret are not configured for this profile.",
      fetchedAt: new Date().toISOString(),
      channel: null,
      videos: [],
      analytics: emptyAnalytics(),
      workspaces,
    };
  }

  try {
    const youtube = google.youtube({ version: "v3", auth: client });
    const chResponse = await youtube.channels.list({
      part: ["snippet", "statistics", "contentDetails", "brandingSettings"],
      mine: true,
    });

    const channels = chResponse.data.items || [];
    if (channels.length !== 1 || !channels[0].id) {
      throw new Error("Choose a single YouTube channel during Google sign-in.");
    }
    const rawChannel = channels[0];
    if (account.youtubeChannelId && account.youtubeChannelId !== rawChannel.id) {
      throw new Error(
        "This workspace belongs to a different YouTube channel. Add a separate account for this channel.",
      );
    }

    const channelTitle =
      rawChannel.snippet?.title || account.youtubeChannelTitle || "YouTube Channel";
    bindChannel(accountId, rawChannel.id!, channelTitle);

    const customUrl = rawChannel.snippet?.customUrl || "";
    const uploadsPlaylistId =
      rawChannel.contentDetails?.relatedPlaylists?.uploads || "";

    const channelDetails: StudioChannelDetails = {
      id: rawChannel.id!,
      title: channelTitle,
      customUrl,
      description: rawChannel.snippet?.description || "",
      publishedAt: rawChannel.snippet?.publishedAt || "",
      country: rawChannel.snippet?.country || "",
      avatar:
        rawChannel.snippet?.thumbnails?.medium?.url ||
        rawChannel.snippet?.thumbnails?.high?.url ||
        rawChannel.snippet?.thumbnails?.default?.url ||
        "",
      bannerUrl: rawChannel.brandingSettings?.image?.bannerExternalUrl || "",
      subscriberCount: Number(rawChannel.statistics?.subscriberCount || 0),
      hiddenSubscriberCount: Boolean(rawChannel.statistics?.hiddenSubscriberCount),
      viewCount: Number(rawChannel.statistics?.viewCount || 0),
      videoCount: Number(rawChannel.statistics?.videoCount || 0),
      uploadsPlaylistId,
      channelUrl: customUrl
        ? `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : `@${customUrl}`}`
        : `https://www.youtube.com/channel/${rawChannel.id}`,
      studioUrl: `https://studio.youtube.com/channel/${rawChannel.id}`,
    };

    const videos: StudioVideoItem[] = [];
    if (
      uploadsPlaylistId &&
      typeof youtube.playlistItems?.list === "function" &&
      typeof youtube.videos?.list === "function"
    ) {
      const playlistRes = await youtube.playlistItems
        .list({
          part: ["contentDetails", "snippet"],
          playlistId: uploadsPlaylistId,
          maxResults: 30,
        })
        .catch(() => null);

      const videoIds = (playlistRes?.data?.items || [])
        .map((item) => item.contentDetails?.videoId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (videoIds.length > 0) {
        const videosRes = await youtube.videos
          .list({
            part: ["snippet", "statistics", "contentDetails", "status"],
            id: videoIds,
          })
          .catch(() => null);

        for (const item of videosRes?.data?.items || []) {
          if (!item.id) continue;
          const title = item.snippet?.title || "Untitled video";
          const description = item.snippet?.description || "";
          const durationIso = item.contentDetails?.duration || "PT0S";
          const durationSeconds = parseIsoDurationSeconds(durationIso);
          const isShort =
            (durationSeconds > 0 && durationSeconds <= 65) ||
            /#shorts\b/i.test(`${title} ${description}`);
          const viewCount = Number(item.statistics?.viewCount || 0);
          const likeCount = Number(item.statistics?.likeCount || 0);
          const commentCount = Number(item.statistics?.commentCount || 0);
          const engagementRate =
            viewCount > 0
              ? Number((((likeCount + commentCount) / viewCount) * 100).toFixed(2))
              : 0;
          const rawPrivacy = item.status?.privacyStatus || "public";
          const privacyStatus: "public" | "unlisted" | "private" =
            rawPrivacy === "private" || rawPrivacy === "unlisted"
              ? rawPrivacy
              : "public";

          videos.push({
            id: item.id,
            title,
            description,
            publishedAt: item.snippet?.publishedAt || "",
            thumbnail:
              item.snippet?.thumbnails?.medium?.url ||
              item.snippet?.thumbnails?.high?.url ||
              item.snippet?.thumbnails?.default?.url ||
              "",
            durationIso,
            durationSeconds,
            durationFormatted: formatDurationSeconds(durationSeconds),
            isShort,
            privacyStatus,
            publishAt: item.status?.publishAt || undefined,
            madeForKids: Boolean(item.status?.madeForKids),
            definition: item.contentDetails?.definition || "hd",
            viewCount,
            likeCount,
            commentCount,
            engagementRate,
            url: isShort
              ? `https://www.youtube.com/shorts/${item.id}`
              : `https://www.youtube.com/watch?v=${item.id}`,
            studioUrl: `https://studio.youtube.com/video/${item.id}/edit`,
          });
        }
      }
    }

    videos.sort(
      (a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0),
    );

    const analytics = computeAnalytics(videos);
    channelDetails.viewCount = Math.max(channelDetails.viewCount, analytics.recentViews);
    channelDetails.videoCount = Math.max(channelDetails.videoCount, videos.length);
    const result: AccountStudioOverview = {
      accountId: account.id,
      accountName: account.name,
      accountColor: account.color,
      accountAvatar: account.avatar,
      boundChannelId: rawChannel.id || null,
      boundChannelTitle: channelTitle,
      configured: true,
      authenticated: true,
      credentialSource: credInfo.source,
      fetchedAt: new Date().toISOString(),
      channel: channelDetails,
      videos,
      analytics,
      workspaces,
    };

    studioCache.set(accountId, {
      expiresAt: Date.now() + STUDIO_CACHE_TTL_MS,
      revision,
      data: result,
    });

    return result;
  } catch (error) {
    return {
      accountId: account.id,
      accountName: account.name,
      accountColor: account.color,
      accountAvatar: account.avatar,
      boundChannelId: account.youtubeChannelId || null,
      boundChannelTitle: account.youtubeChannelTitle || null,
      configured: true,
      authenticated: false,
      credentialSource: credInfo.source,
      message:
        error instanceof Error
          ? error.message
          : "Reconnect this YouTube account to view Studio stats.",
      fetchedAt: new Date().toISOString(),
      channel: null,
      videos: [],
      analytics: emptyAnalytics(),
      workspaces,
    };
  }
}

export async function fetchAllAccountsStudioDashboard(options: {
  forceRefresh?: boolean;
} = {}) {
  const accounts = listAccounts();
  const profiles = await Promise.all(
    accounts.map((acc) => fetchAccountStudioOverview(acc.id, options)),
  );

  const totals = {
    totalAccounts: profiles.length,
    connectedAccounts: profiles.filter((p) => p.authenticated).length,
    totalSubscribers: profiles.reduce(
      (sum, p) => sum + (p.channel?.subscriberCount || 0),
      0,
    ),
    totalChannelViews: profiles.reduce(
      (sum, p) => sum + (p.channel?.viewCount || 0),
      0,
    ),
    totalChannelVideos: profiles.reduce(
      (sum, p) => sum + (p.channel?.videoCount || 0),
      0,
    ),
    recentViews: profiles.reduce((sum, p) => sum + p.analytics.recentViews, 0),
    recentLikes: profiles.reduce((sum, p) => sum + p.analytics.recentLikes, 0),
    recentComments: profiles.reduce(
      (sum, p) => sum + p.analytics.recentComments,
      0,
    ),
    viewsLast28Days: profiles.reduce(
      (sum, p) => sum + p.analytics.viewsLast28Days,
      0,
    ),
    uploadsLast28Days: profiles.reduce(
      (sum, p) => sum + p.analytics.uploadsLast28Days,
      0,
    ),
    shortsCount: profiles.reduce((sum, p) => sum + p.analytics.shortsCount, 0),
    longCount: profiles.reduce((sum, p) => sum + p.analytics.longCount, 0),
    totalWorkspaceScripts: profiles.reduce(
      (sum, p) => sum + p.workspaces.totalScripts,
      0,
    ),
    totalWorkspaceRendered: profiles.reduce(
      (sum, p) => sum + p.workspaces.totalRendered,
      0,
    ),
  };

  return {
    fetchedAt: new Date().toISOString(),
    totals,
    profiles,
  };
}
