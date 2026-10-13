import fs from 'node:fs';
import path from 'node:path';
import { flowDownloadsDir, type StepLog } from './jobs.js';
import { flowProfileDir } from './profile.js';
import { deductFlowCredits } from './credits.js';

// Live Google Flow worker (Playwright browser automation).
//
// Rules for Google Flow (flow.google.com):
// - Headless persistent context reuses Google session from profile dir.
// - Must navigate into a project (create via "+ New project" if on dashboard).
// - Configure Video settings: Video tab, aspect ratio (9:16 portrait or 16:9 landscape),
//   x1 output, duration, and model.
// - Enter prompt into contenteditable ProseMirror composer and click "Start generation".
// - Poll until flow-video-tile finishes rendering, click tile to open scene viewer,
//   wait for "Download media" button to become enabled, click "720p Original size", and save the MP4.

export type OverseerCode =
  | 'AUTH_EXPIRED'
  | 'PROFILE_LOCKED'
  | 'CLARIFICATION'
  | 'CREDIT_DIALOG'
  | 'BUDGET_BLOCKED'
  | 'RECAPTCHA_BLOCKED'
  | 'TIMEOUT'
  | 'UI_CHANGED'
  | 'CANCELLED'
  | 'UNKNOWN';

const STEP_TIMEOUT_MS = 90_000;
const GENERATION_TIMEOUT_MS = 10 * 60_000;

function shotsDir(jobId: string): string {
  const dir = path.join(flowProfileDir(), '..', 'shots', jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function shot(page: { screenshot: (opts: { path: string }) => Promise<unknown> }, dir: string, name: string): Promise<string> {
  const file = path.join(dir, `${name}.png`);
  try {
    await page.screenshot({ path: file });
    return file;
  } catch {
    return '';
  }
}

function getBrowserChannel(): string | undefined {
  if (process.env.FLOW_BROWSER_CHANNEL) {
    return process.env.FLOW_BROWSER_CHANNEL;
  }
  // On Windows, Microsoft Edge is digitally signed, avoids Google G12 bot detection, and has valid Google auth
  if (process.platform === 'win32') {
    const edgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    if (edgePaths.some((p) => fs.existsSync(p))) {
      return 'msedge';
    }
  }
  return undefined;
}

export function classifyFailure(message: string, url: string): OverseerCode {
  const text = `${message} ${url}`.toLowerCase();
  if (/accounts\.google|signin\/rejected|choose an account|session expired/i.test(text)) return 'AUTH_EXPIRED';
  if (/profile.*(in use|locked)|singletonlock|user data directory is already in use|could not remove old devtools/i.test(text)) return 'PROFILE_LOCKED';
  if (/recaptcha|unusual traffic|try again later|automated queries/i.test(text)) return 'RECAPTCHA_BLOCKED';
  if (/credit|billing|payment|quota|out of credits/i.test(text)) return 'CREDIT_DIALOG';
  if (/clarif|could you|which.*prefer|what.*mean/i.test(text)) return 'CLARIFICATION';
  if (/timeout|timed out|waiting for/i.test(text)) return 'TIMEOUT';
  if (/selector|locator|element.*not found|detached|ui_changed/i.test(text)) return 'UI_CHANGED';
  return 'UNKNOWN';
}

export function recoveryHint(code: OverseerCode): string {
  switch (code) {
    case 'AUTH_EXPIRED': return 'Sign in to Google once in the headed profile, then retry the job.';
    case 'PROFILE_LOCKED': return 'Close the manual Flow/Chrome window that is still open on this profile, then retry. One profile = one writer.';
    case 'CLARIFICATION': return 'Flow asked a question instead of generating. Check prompt format.';
    case 'CREDIT_DIALOG': return 'A credit confirmation appeared. Approve manually in the profile browser once, or lower the model to Lite/Fast.';
    case 'BUDGET_BLOCKED': return 'Episode credit budget would be exceeded. Raise FLOW_CREDIT_BUDGET_PER_EPISODE or use Lite.';
    case 'RECAPTCHA_BLOCKED': return 'Google challenged the automation. Retry headed (FLOW_HEADLESS=false) once.';
    case 'TIMEOUT': return 'Render exceeded 10 minutes.';
    case 'UI_CHANGED': return 'Flow changed its markup. Check the saved screenshot and retry.';
    case 'CANCELLED': return 'Cancelled by user.';
    default: return 'See the step log + screenshot and retry.';
  }
}

export interface LiveRunInput {
  jobId: string;
  prompt?: string;
  promptWrapped: string;
  projectUrl: string;
  aspect: 'portrait' | 'landscape';
  duration?: number;
  model?: string;
  resolution?: '720p' | '1080p';
  referenceImagePath?: string;
  signal: AbortSignal;
  onStage: (stage: string, progress: number, detail?: string) => void;
  logStep: (entry: StepLog) => void;
}

export async function runLiveGeneration(input: LiveRunInput): Promise<{ filePath: string; bytes: number }> {
  const { chromium } = await import('playwright');
  const headless = (process.env.FLOW_HEADLESS || 'true').toLowerCase() !== 'false';
  const dir = shotsDir(input.jobId);

  const fail = (step: string, error: unknown, url: string): Error => {
    const code = input.signal.aborted ? 'CANCELLED' : classifyFailure(error instanceof Error ? error.message : String(error), url);
    const err = new Error(`${code}: ${error instanceof Error ? error.message : String(error)} — ${recoveryHint(code)}`);
    (err as { overseerCode?: OverseerCode }).overseerCode = code;
    input.logStep({ step: `${step}:failed`, at: new Date().toISOString(), detail: code });
    return err;
  };

  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    input.onStage('Opening Flow in persistent profile', 5);
    const channel = getBrowserChannel();
    context = await chromium.launchPersistentContext(flowProfileDir(), {
      channel,
      headless,
      viewport: { width: 1366, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
      acceptDownloads: true,
      timeout: STEP_TIMEOUT_MS,
    });

    const page = context.pages()[0] || (await context.newPage());
    input.signal.throwIfAborted();

    const targetUrl = input.projectUrl || 'https://flow.google.com/';
    try {
      await page.goto(targetUrl, { timeout: STEP_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    } catch (error) {
      await shot(page, dir, 'open-failed');
      throw fail('open', error, page.url());
    }

    // 1. Handle marketing/landing page if present
    if (page.url().includes('/about') || (await page.locator('button:has-text("Create with Google Flow"), a:has-text("Create with Google Flow")').count()) > 0) {
      const cta = page.locator('button:has-text("Create with Google Flow"), a:has-text("Create with Google Flow")').first();
      if ((await cta.count()) > 0) {
        await cta.click();
        await page.waitForNavigation({ timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(3000);
      }
    }

    // 2. Handle Google account chooser if prompted
    if (/accounts\.google|signin|accountchooser/i.test(page.url())) {
      const accountTile = page.locator('[data-identifier*="@gmail.com"], li:has-text("@gmail.com"), div[role="link"]:has-text("Raj chauhan-17")').first();
      if ((await accountTile.count()) > 0) {
        await accountTile.click();
        await page.waitForNavigation({ timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(3000);
      }
    }

    input.logStep({ step: 'open', at: new Date().toISOString(), shot: await shot(page, dir, 'open') });

    if (/signin\/rejected/i.test(page.url())) {
      await shot(page, dir, 'auth-expired');
      throw fail('open', new Error('Google sign-in rejected. Headed login required.'), page.url());
    }

    // 3. Enter project studio if not already inside a project
    input.onStage('Entering project studio', 15);
    input.signal.throwIfAborted();
    if (!page.url().includes('/project/')) {
      const newProjectBtn = page.locator('button:has-text("New project"), [aria-label*="New project" i], div:has-text("New project")').first();
      if ((await newProjectBtn.count()) > 0) {
        await newProjectBtn.click({ timeout: 15000 });
        await page.waitForURL('**/project/**', { timeout: 30000 }).catch(() => null);
        await page.waitForTimeout(2000);
      } else {
        // Fallback: click first project card if available
        const projectCard = page.locator('.projects-grid > div, mat-card, .project-card').first();
        if ((await projectCard.count()) > 0) {
          await projectCard.click({ timeout: 10000 });
          await page.waitForURL('**/project/**', { timeout: 30000 }).catch(() => null);
          await page.waitForTimeout(2000);
        }
      }
    }
    input.logStep({ step: 'project-opened', at: new Date().toISOString(), shot: await shot(page, dir, 'project-opened') });

    // 4. Wait for the prompt composer to be ready
    const composer = page.locator('div[contenteditable="true"].ProseMirror, div[contenteditable="true"]').first();
    try {
      await composer.waitFor({ state: 'visible', timeout: 35000 });
    } catch (error) {
      await shot(page, dir, 'composer-missing');
      throw fail('composer-wait', error, page.url());
    }

    // Configure video generation settings
    input.onStage('Configuring video settings (aspect, model, duration)', 25);
    input.signal.throwIfAborted();
    try {
      const settingsBtn = page.locator('button.settings-trigger-button, button[aria-label="Settings trigger"]').first();
      await settingsBtn.waitFor({ state: 'visible', timeout: 15000 });

      // Open settings overlay if not already visible
      const isOverlayOpen = (await page.locator('.cdk-overlay-pane:visible').count()) > 0;
      if (!isOverlayOpen) {
        await settingsBtn.click();
        await page.waitForSelector('.cdk-overlay-pane:visible', { timeout: 6000 });
      }

      const activePane = page.locator('.cdk-overlay-pane:visible').first();

      // Ensure "Video" tab is selected
      const videoTab = activePane.locator('button').filter({ hasText: 'Video' }).first();
      if ((await videoTab.count()) > 0) {
        await videoTab.click();
        await page.waitForTimeout(300);
      }

      // Aspect ratio: 9:16 for portrait (Shorts), 16:9 for landscape (Long video)
      const targetAspectLabel = input.aspect === 'portrait' ? '9:16' : '16:9';
      const aspectBtn = activePane.locator('button').filter({ hasText: targetAspectLabel }).first();
      if ((await aspectBtn.count()) > 0) {
        await aspectBtn.click();
        await page.waitForTimeout(300);
      } else {
        throw new Error(`Aspect ratio button for "${targetAspectLabel}" not found in Flow settings popup.`);
      }

      // Output count: x1 (avoids consuming double credits)
      const x1Btn = activePane.locator('button').filter({ hasText: 'x1' }).first();
      if ((await x1Btn.count()) > 0) {
        await x1Btn.click();
        await page.waitForTimeout(300);
      }

      // Duration: 4s, 6s, 8s, 10s
      if (input.duration) {
        const durBtn = activePane.locator('button').filter({ hasText: `${input.duration}s` }).first();
        if ((await durBtn.count()) > 0) {
          await durBtn.click();
          await page.waitForTimeout(300);
        }
      }

      // Model selection if specified
      if (input.model) {
        const modelMap: Record<string, string> = {
          'veo-3.1-fast': 'Veo 3.1 - Fast',
          'veo-3.1-lite': 'Veo 3.1 - Lite',
          'veo-3.1-quality': 'Veo 3.1 - Quality',
          'omni-flash': 'Omni 1.1 Flash',
        };
        const targetModel = modelMap[input.model];
        if (targetModel) {
          const dropdown = activePane.locator('button[aria-label*="model" i], button:has-text("arrow_drop_down")').first();
          if ((await dropdown.count()) > 0) {
            const currentModelText = (await dropdown.innerText().catch(() => '')).trim();
            // Only open and switch if the requested model is not already active
            if (!currentModelText.includes(targetModel)) {
              await dropdown.click();
              await page.waitForTimeout(500);
              // Target strictly inside the opened menu dropdown, avoiding the trigger button outside
              const opt = page.locator('[role="menu"] [role="menuitem"], .mat-mdc-menu-panel button').filter({ hasText: targetModel }).first();
              if ((await opt.count()) > 0) {
                await opt.click();
                await page.waitForTimeout(400);
              } else {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(300);
              }
            }
          }
        }
      }

      // Close settings popup: press Escape and ensure overlay is hidden
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      if ((await page.locator('.cdk-overlay-pane:visible').count()) > 0) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }

      // Verify aspect ratio in settings trigger summary
      const triggerSummary = (await settingsBtn.innerText().catch(() => '')).replace(/\n+/g, ' ');
      const expectedAspectMarker = input.aspect === 'portrait' ? '9_16' : '16_9';
      if (!triggerSummary.includes(expectedAspectMarker) && !triggerSummary.includes(targetAspectLabel)) {
        console.warn(`[Flow Worker] Warning: Trigger button "${triggerSummary}" did not reflect ${targetAspectLabel}. Retrying...`);
        await settingsBtn.click();
        await page.waitForSelector('.cdk-overlay-pane:visible', { timeout: 4000 });
        const retryBtn = page.locator('.cdk-overlay-pane:visible button').filter({ hasText: targetAspectLabel }).first();
        if ((await retryBtn.count()) > 0) {
          await retryBtn.click();
          await page.waitForTimeout(300);
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }

      input.logStep({
        step: 'settings-configured',
        at: new Date().toISOString(),
        detail: `aspect=${input.aspect} (${targetAspectLabel}), summary=${triggerSummary}`,
        shot: await shot(page, dir, 'settings-configured'),
      });
    } catch (settingsErr) {
      console.error('[Flow Worker] Settings configuration error:', settingsErr);
      await shot(page, dir, 'settings-error');
      // If setting aspect ratio failed, do not silently proceed with wrong aspect ratio
      throw fail('settings-aspect', settingsErr, page.url());
    }

    // Attach 2D reference frame for Image-to-Video if available
    if (input.referenceImagePath && fs.existsSync(input.referenceImagePath)) {
      input.onStage('Attaching reference frame to Flow (Image-to-Video)', 30);
      input.signal.throwIfAborted();
      try {
        const addIngredientsBtn = page.locator('button[aria-label="Add ingredients to the prompt box"], .add-menu-trigger').first();
        if ((await addIngredientsBtn.count()) > 0) {
          await addIngredientsBtn.click();
          await page.waitForTimeout(600);

          const uploadBtn = page.locator('button:has-text("Upload media"), .cdk-overlay-pane button:has-text("Upload")').first();
          await uploadBtn.waitFor({ state: 'visible', timeout: 8000 });

          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 12000 }),
            uploadBtn.click(),
          ]);

          if (fileChooser) {
            await fileChooser.setFiles(input.referenceImagePath);
            await page.waitForTimeout(1000);

            const addToPromptBtn = page.locator('button:has-text("Add to prompt")').first();
            await addToPromptBtn.waitFor({ state: 'visible', timeout: 15000 });

            for (let i = 0; i < 20; i++) {
              if (await addToPromptBtn.isEnabled().catch(() => false)) break;
              await page.waitForTimeout(500);
            }
            await addToPromptBtn.click();
            await page.waitForTimeout(1000);
            input.logStep({
              step: 'reference-attached',
              at: new Date().toISOString(),
              detail: path.basename(input.referenceImagePath),
              shot: await shot(page, dir, 'reference-attached'),
            });
          }
        }
      } catch (refErr) {
        console.warn('[Flow Worker] Could not attach reference image (proceeding with text prompt):', refErr);
      }
    }

    // Fill scene prompt
    input.onStage('Pasting scene prompt into Google Flow', 35);
    input.signal.throwIfAborted();
    try {
      await composer.click();
      const promptToUse = (input.prompt || input.promptWrapped || '').trim();
      await composer.fill(promptToUse);
      await page.waitForTimeout(800);
    } catch (error) {
      await shot(page, dir, 'paste-failed');
      throw fail('paste', error, page.url());
    }
    input.logStep({ step: 'paste', at: new Date().toISOString(), shot: await shot(page, dir, 'paste') });

    // Click Start Generation
    input.onStage('Submitting generation to Google Flow', 45);
    input.signal.throwIfAborted();
    try {
      const startBtn = page.locator('button[aria-label="Start generation"], button.generate-icon-button, button[type="submit"]:has(mat-icon:has-text("arrow_forward"))').first();
      await startBtn.click();
      await page.waitForTimeout(3000);
    } catch (error) {
      await shot(page, dir, 'generate-failed');
      throw fail('generate', error, page.url());
    }
    input.logStep({ step: 'generate-click', at: new Date().toISOString(), shot: await shot(page, dir, 'generate-click') });

    // Click the new flow-video-tile to enter scene viewer (where live progress percentage and download live)
    const videoTile = page.locator('flow-video-tile').first();
    try {
      await videoTile.waitFor({ state: 'attached', timeout: 30000 });
      await videoTile.click({ timeout: 10000 }).catch(() => null);
    } catch {
      // Continue polling
    }

    input.onStage('Rendering in Google Flow (tracking progress)', 50);
    const deadline = Date.now() + GENERATION_TIMEOUT_MS;
    let downloadPath = '';

    while (Date.now() < deadline) {
      input.signal.throwIfAborted();

      // Ensure we are inside the scene viewer; if closed, click tile
      const dlBtn = page.locator('button[aria-label="Download media"]').first();
      if ((await dlBtn.count()) === 0) {
        const tile = page.locator('flow-video-tile').first();
        if ((await tile.count()) > 0) {
          await tile.click({ timeout: 5000 }).catch(() => null);
          await page.waitForTimeout(1000);
        }
      }

      // Check if download button is enabled (enabled only when generation is 100% complete)
      const dlEnabled = page.locator('button[aria-label="Download media"]:not([disabled])').first();
      const isEnabled = (await dlEnabled.count()) > 0 && (await dlEnabled.isEnabled().catch(() => false));

      // Extract visible percentage from player (e.g. "21%", "65%")
      const pctMatch = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const m = bodyText.match(/\b(\d{1,3})%/);
        return m ? parseInt(m[1], 10) : null;
      }).catch(() => null);

      if (pctMatch !== null && pctMatch < 100) {
        input.onStage(`Rendering in Flow (${pctMatch}%)`, Math.max(50, Math.min(92, pctMatch)));
      } else {
        const elapsed = Math.round((Date.now() - (deadline - GENERATION_TIMEOUT_MS)) / 1000);
        input.onStage(`Rendering in Flow (${elapsed}s elapsed)`, Math.min(90, 50 + Math.round((elapsed / 60) * 10)));
      }

      if (isEnabled) {
        const resolution = input.resolution || '720p';
        input.onStage(`Render finished — initiating ${resolution} MP4 download`, 94);
        try {
          await dlEnabled.click({ timeout: 10000 });
          await page.waitForTimeout(800);

          let targetOpt = page.locator('button:has-text("720p Original size"), button:has-text("720p"), [role="menuitem"]:has-text("720p")').first();
          let chosenRes = '720p';

          if (resolution === '1080p') {
            const opt1080 = page.locator('button:has-text("1080p Upscaled"), button:has-text("1080p"), [role="menuitem"]:has-text("1080p")').first();
            if ((await opt1080.count()) > 0) {
              const isDisabled = await opt1080.isDisabled().catch(() => false);
              if (!isDisabled) {
                targetOpt = opt1080;
                chosenRes = '1080p';
              }
            }
          }

          await targetOpt.waitFor({ state: 'visible', timeout: 10000 });

          const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
          await targetOpt.click();

          let download = await downloadPromise;

          // If 1080p triggered upscaling in Flow instead of immediate download, wait for upscale
          if (!download && chosenRes === '1080p') {
            input.onStage('Flow is upscaling video to 1080p HD (waiting for upscale)', 96);
            await page.waitForTimeout(5000);
            for (let retry = 0; retry < 12; retry++) {
              input.signal.throwIfAborted();
              await page.waitForTimeout(4000);
              const retryDlBtn = page.locator('button[aria-label="Download media"]:not([disabled])').first();
              if ((await retryDlBtn.count()) > 0) {
                await retryDlBtn.click().catch(() => null);
                await page.waitForTimeout(800);
                const retry1080 = page.locator('button:has-text("1080p"), [role="menuitem"]:has-text("1080p")').first();
                if ((await retry1080.count()) > 0) {
                  const dlRetryPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
                  await retry1080.click().catch(() => null);
                  download = await dlRetryPromise;
                  if (download) break;
                }
              }
            }

            // Safe fallback to 720p if upscale did not finish
            if (!download) {
              input.onStage('Falling back to 720p native download', 97);
              const retryDlBtn = page.locator('button[aria-label="Download media"]:not([disabled])').first();
              await retryDlBtn.click().catch(() => null);
              await page.waitForTimeout(600);
              const fallback720 = page.locator('button:has-text("720p"), [role="menuitem"]:has-text("720p")').first();
              const dlFallback = page.waitForEvent('download', { timeout: 30000 });
              await fallback720.click();
              download = await dlFallback;
            }
          }

          if (download) {
            const out = path.join(flowDownloadsDir(), `${input.jobId}.mp4`);
            await download.saveAs(out);
            downloadPath = out;
            break;
          }
        } catch {
          // If menu click failed temporarily, close menu and retry
          await page.keyboard.press('Escape').catch(() => null);
          await page.waitForTimeout(1000);
        }
      }

      await page.waitForTimeout(4000);
    }

    if (!downloadPath) {
      await shot(page, dir, 'timeout');
      throw fail('download', new Error(`No downloadable render within ${GENERATION_TIMEOUT_MS / 60000} minutes.`), page.url());
    }

    input.logStep({ step: 'download', at: new Date().toISOString(), shot: await shot(page, dir, 'download') });
    const bytes = fs.statSync(downloadPath).size;
    if (bytes < 10_000) {
      throw fail('download', new Error(`Downloaded video is suspiciously small (${bytes} bytes).`), page.url());
    }

    input.onStage('Video downloaded from Flow successfully', 100);
    deductFlowCredits(12);
    return { filePath: downloadPath, bytes };
  } finally {
    try {
      await context?.close();
    } catch {
      // Profile lock must release
    }
  }
}
