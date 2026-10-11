# 🚀 Google Flow & TubeFlow Setup Guide for New PCs
> **Note for AI Coding Assistants & Developers:** This document contains exact instructions to get TubeFlow and its automated Google Flow video generation running on any new or secondary PC.

---

## 1. Overview & Architecture

TubeFlow is a full-stack automated video production studio:
- **Frontend**: Vite + React + TypeScript on `http://localhost:5173`
- **Backend**: Node.js + Express on `http://localhost:3001`
- **Google Flow Automation Engine**: Playwright browser automation in `server/src/services/flow/worker.ts`
- **Session Profile**: Persistent Chromium/Edge profile stored locally at `server/data/flow/profile-default/` (ignored in `.gitignore` for security).

---

## 2. Prerequisites

1. **Node.js**: v18.0.0 or newer (v20+ recommended).
2. **Web Browser**:
   - **Windows**: Microsoft Edge (pre-installed) or Google Chrome.
   - *Why Edge?* Edge is digitally signed on Windows. Google's G12 bot detection allows Google OAuth sign-in seamlessly on Edge without triggering `"This browser or app may not be secure"`.
3. **FFmpeg**: Ensure `ffmpeg` and `ffprobe` are installed and available in the system `PATH`.

---

## 3. Step-by-Step Setup Instructions

### Step 1: Install Dependencies
Open a terminal in the project root directory and run:

```bash
# 1. Install root workspace packages
npm install

# 2. Install server packages
npm install --prefix server

# 3. Ensure Playwright browsers are installed
npx playwright install chromium
```

---

### Step 2: One-Time Google Flow Authentication (Headed Login)
Because browser profiles containing personal Google login cookies are excluded from Git, each new PC must authenticate once:

```bash
npm run flow:login
```

**What this command does:**
1. Opens a visible (headed) browser window with Microsoft Edge.
2. Navigates directly to `https://flow.google.com/`.
3. **What the user needs to do:**
   - Click **Sign In** and log into the Google Account that has Google Flow / Pro access.
   - Complete 2-Factor Authentication (2FA) if prompted.
   - Once Google Flow loads (showing the projects gallery or studio), **simply close the browser window**.
4. The login helper automatically saves the session cookies into `server/data/flow/profile-default/` and syncs the account email into `server/data/flow/credits.json`.

---

### Step 3: Start the Application
Run the unified development command:

```bash
npm run dev
```

This starts:
- Server API at `http://localhost:3001`
- Client Web UI at `http://localhost:5173`

Open `http://localhost:5173` in any browser.

---

## 4. Using Google Flow Video Generation

1. Go to the **Scripts** tab and open any script (e.g. `Shorts · Images & Videos`).
2. Navigate to the **Generation** tab.
3. At the top of the page, the **Google Flow AI Video** bar displays:
   - The active logged-in Google account email (`👤 account@gmail.com`)
   - Remaining Flow credits balance (e.g., `788 Credits (~65 videos remaining)`)
   - Subscription tier (`PRO`)
   - **Switch Account** button
4. Each scene card has a toggle for `[Image | Video]`:
   - For video scenes, click **Generate with Flow**.
   - **Aspect Ratio**: Automatically locks to **9:16 vertical** for Shorts and **16:9 horizontal** for Long videos.
   - **Resolution**: Toggle between **720p Fast** (~50s) and **1080p Upscaled** (~2 min).
   - **Credit Cost**: Configured to single-output (`x1`) to consume only ~12 credits per video (saving 50% compared to default dual-output).
   - Once generated, the video MP4 is automatically downloaded and imported into the timeline.

---

## 5. How to Switch Google Accounts (When Credits Run Out)

When one Google account runs low on credits, you can easily switch to another account without restarting the app:

### Method A: From the UI (1-Click)
1. On the **Generation** tab, click **Switch Account** on the top bar (or inside any scene card).
2. Click **"Open Browser to Switch / Add Account"**.
3. A browser window opens. Click the profile avatar in Google Flow, choose **"Use another account"** or sign in with your second account.
4. Close the browser window.
5. TubeFlow automatically updates the account label and credit balance.

### Method B: From the Terminal
Run:
```bash
npm run flow:login
```
Sign into the new account, verify Flow loads, and close the window.

---

## 6. Architecture & Automation Edge Cases (Already Solved in Code)

For AI agents modifying or debugging the automation in `server/src/services/flow/worker.ts`:
- **G12 Bot Block**: `getBrowserChannel()` auto-detects `msedge` on Windows to bypass Google's automation blocker.
- **Marketing Page (`/about`)**: Google often redirects to `flow.google.com/about`. The worker detects this and clicks `Create with Google Flow`.
- **Single-Output (`x1`)**: The worker explicitly opens settings and clicks `x1` to prevent burning double credits.
- **Aspect Ratio Verification**: The worker verifies `crop_9_16` or `crop_16_9` in the prompt settings trigger before submitting.
- **Progress Tracking**: The worker reads live progress (`0%` to `100%`) directly from the video player.
- **Download Handling**: If 1080p upscale is selected, it waits for Flow's upscale pass, with a fallback to 720p original size if upscaling times out.
