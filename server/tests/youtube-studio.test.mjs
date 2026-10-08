import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { google } from "googleapis";

const root = path.resolve("server/data");
const directory = fs.mkdtempSync(path.join(root, "yt-studio-test-"));
process.env.TUBEFLOW_DATA_DIR = directory;

const accounts = await import("../dist/services/accounts.js");
const auth = await import("../dist/services/youtube-auth.js");
const { workspacesRouter } = await import("../dist/routes/workspaces.js");
const { accountsRouter } = await import("../dist/routes/accounts.js");
const { youtubeAuthRouter } = await import("../dist/routes/youtube-auth.js");

const originalYoutube = google.youtube;

google.youtube = ({ auth: client }) => {
  const token = client.credentials.access_token;
  return {
    channels: {
      list: async () => ({
        data: {
          items: [
            {
              id: `UC_${token}`,
              snippet: {
                title: `Channel ${token}`,
                customUrl: `@handle_${token}`,
                description: `Description for ${token}`,
                country: "IN",
              },
              statistics: {
                subscriberCount: token === "default-tok" ? "526" : "12",
                viewCount: token === "default-tok" ? "68667" : "340",
                videoCount: token === "default-tok" ? "79" : "2",
              },
              contentDetails: {
                relatedPlaylists: {
                  uploads: `UU_${token}`,
                },
              },
            },
          ],
        },
      }),
    },
    playlistItems: {
      list: async () => ({
        data: {
          items: [
            { contentDetails: { videoId: `vid_short_${token}` } },
            { contentDetails: { videoId: `vid_long_${token}` } },
          ],
        },
      }),
    },
    videos: {
      list: async () => ({
        data: {
          items: [
            {
              id: `vid_short_${token}`,
              snippet: {
                title: `Viral Short ${token} #shorts`,
                description: "Short video",
                publishedAt: new Date().toISOString(),
                thumbnails: { medium: { url: "https://i.ytimg.com/vi/test/mqdefault.jpg" } },
              },
              contentDetails: { duration: "PT45S", definition: "hd" },
              statistics: { viewCount: "500", likeCount: "40", commentCount: "5" },
              status: { privacyStatus: "public", madeForKids: false },
            },
            {
              id: `vid_long_${token}`,
              snippet: {
                title: `Deep Dive Video ${token}`,
                description: "Long form video",
                publishedAt: new Date(Date.now() - 86400000).toISOString(),
                thumbnails: { medium: { url: "https://i.ytimg.com/vi/test2/mqdefault.jpg" } },
              },
              contentDetails: { duration: "PT8M15S", definition: "hd" },
              statistics: { viewCount: "1200", likeCount: "95", commentCount: "12" },
              status: { privacyStatus: "public", madeForKids: false },
            },
          ],
        },
      }),
    },
  };
};

accounts.atomicJson(auth.CLIENT_SECRET_PATH, {
  installed: { client_id: "test-client", client_secret: "test-secret" },
});
accounts.atomicJson(accounts.tokenPath("default"), {
  access_token: "default-tok",
  refresh_token: "refresh-default",
});

const second = accounts.createAccount("Second Profile");
const third = accounts.createAccount("Third Profile");
accounts.atomicJson(accounts.tokenPath(second.id), {
  access_token: "second-tok",
  refresh_token: "refresh-second",
});

const app = express();
app.use(express.json());
app.use("/api/accounts", accountsRouter);
app.use("/api/accounts/:accountId/profiles/:profile", workspacesRouter);
app.use("/api/youtube", youtubeAuthRouter);

const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

test("per-profile /youtube/studio and multi-profile /youtube/dashboard return channel stats and video analytics", async () => {
  const studioDefaultRes = await fetch(
    `${base}/api/accounts/default/profiles/shorts/youtube/studio`,
  );
  assert.equal(studioDefaultRes.status, 200);
  const studioDefault = await studioDefaultRes.json();
  assert.equal(studioDefault.authenticated, true);
  assert.equal(studioDefault.channel.title, "Channel default-tok");
  assert.equal(studioDefault.channel.subscriberCount, 526);
  assert.equal(studioDefault.videos.length, 2);
  assert.equal(studioDefault.analytics.shortsCount, 1);
  assert.equal(studioDefault.analytics.longCount, 1);
  assert.equal(studioDefault.analytics.recentViews, 1700);

  const studioThirdRes = await fetch(
    `${base}/api/accounts/${third.id}/profiles/shorts/youtube/studio`,
  );
  assert.equal(studioThirdRes.status, 200);
  const studioThird = await studioThirdRes.json();
  assert.equal(studioThird.authenticated, false);
  assert.equal(studioThird.channel, null);

  const dashboardRes = await fetch(`${base}/api/youtube/dashboard`);
  assert.equal(dashboardRes.status, 200);
  const dashboard = await dashboardRes.json();
  assert.equal(dashboard.totals.totalAccounts, 3);
  assert.equal(dashboard.totals.connectedAccounts, 2);
  assert.equal(dashboard.totals.totalSubscribers, 538);
  assert.equal(dashboard.profiles.length, 3);
});

test.after(async () => {
  google.youtube = originalYoutube;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
});
