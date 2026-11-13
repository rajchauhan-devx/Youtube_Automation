import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { FlowMusicSettings, FlowMusicJob } from './flow-music-types.js';
import {
  flowMusicProfileDir,
  flowMusicDownloadsDir,
  getBrowserChannel,
  cleanLockFiles,
  saveFlowMusicAccount,
} from './flow-music-profile.js';
import { store } from '../store.js';
import { generatedDir, mediaUrl } from '../workspace.js';
import { containedFile } from '../paths.js';
import {
  synthesizeSongWithAceStep,
  synthesizeFullSongTrack,
  transcribeSongAudio,
  probeAudioDuration,
} from './song-synthesizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..');

const KNOWN_DEMO_CLIP_IDS = ['08d9809f-5d31-4da9-b8b8-92ddcf51d443'];

const jobs = new Map<string, FlowMusicJob>();

export function getFlowMusicJob(jobId: string): FlowMusicJob | undefined {
  return jobs.get(jobId);
}

export function listFlowMusicJobs(scriptId?: string): FlowMusicJob[] {
  const all = Array.from(jobs.values());
  if (!scriptId) return all;
  return all.filter((j) => j.scriptId === scriptId);
}

export function cancelFlowMusicJob(jobId: string): FlowMusicJob | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;
  if (job.state === 'queued' || job.state === 'running') {
    job.state = 'cancelled';
    job.stage = 'Cancelled by user';
    job.updatedAt = new Date().toISOString();
  }
  return job;
}

export function clearFlowMusicJobs(): void {
  for (const job of jobs.values()) {
    if (job.state === 'queued' || job.state === 'running') {
      job.state = 'cancelled';
      job.stage = 'Reset by user';
      job.updatedAt = new Date().toISOString();
    }
  }
  jobs.clear();
}

function isValidCapturedAudioBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 30_000) return false;
  const head = buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{')) {
    return false;
  }
  return true;
}

/**
 * Live Google Flow Music generator powered by Playwright, with automatic
 * local ACE-Step 1.5 singing-song engine and clean procedural fallback.
 */
export async function startFlowMusicGeneration(
  scriptId: string,
  settings: FlowMusicSettings
): Promise<FlowMusicJob> {
  const jobId = `fm_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const job: FlowMusicJob = {
    id: jobId,
    scriptId,
    state: 'running',
    stage: 'Initializing Google Flow Music worker',
    progress: 5,
    settings,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.set(jobId, job);

  // Background execution
  void (async () => {
    const profileDir = flowMusicProfileDir();
    cleanLockFiles(profileDir);
    const downloadsDir = flowMusicDownloadsDir();
    const outputFile = path.join(downloadsDir, `${jobId}.mp3`);

    let context: any = null;
    let generatedWithPlaywright = false;
    let usedEngine = 'flowmusic.app';

    if (process.env.FLOW_MUSIC_DISABLE_PLAYWRIGHT !== '1') {
      try {
        job.stage = 'Connecting Playwright session to Google Flow Music';
        job.progress = 15;
        job.updatedAt = new Date().toISOString();

        const { chromium } = await import('playwright');
        const channel = getBrowserChannel();
        const headless = (process.env.FLOW_MUSIC_HEADLESS || process.env.FLOW_HEADLESS || 'true').toLowerCase() !== 'false';

        context = await chromium.launchPersistentContext(profileDir, {
          channel,
          headless,
          viewport: { width: 1280, height: 800 },
          args: ['--disable-blink-features=AutomationControlled'],
          acceptDownloads: true,
          timeout: 45000,
        });

        const page = context.pages()[0] || (await context.newPage());

        job.stage = 'Navigating to Google Flow Music studio (https://www.flowmusic.app/)';
        job.progress = 25;
        job.updatedAt = new Date().toISOString();

        try {
          await page.goto('https://www.flowmusic.app/', { waitUntil: 'load', timeout: 35000 });
        } catch (navErr: any) {
          console.warn(`[Flow Music] Initial page navigation note: ${navErr?.message}`);
        }
        await page.waitForTimeout(2500);

        // 1. Handle Privacy Notice Modal
        const continueBtn = page.locator('button:has-text("Continue")');
        if (await continueBtn.count() && (await continueBtn.first().isVisible().catch(() => false))) {
          await continueBtn.first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(1500);
        }

        // 2. Handle Creative Suite "Ok" Modal
        const okBtn = page.locator('button').filter({ hasText: /^Ok$/i });
        if (await okBtn.count() && (await okBtn.first().isVisible().catch(() => false))) {
          await okBtn.first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(1500);
        }

        // Double check any lingering modal overlay
        const anyModal = page.locator('.fixed.inset-0');
        if (await anyModal.count() && (await anyModal.first().isVisible().catch(() => false))) {
          const modalBtn = anyModal.locator('button:has-text("Ok"), button:has-text("Continue"), button:has-text("Agree")').last();
          if (await modalBtn.count()) {
            await modalBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1500);
          }
        }

        // Verify whether user is actually signed in on flowmusic.app before submitting
        const loginVisible = await page
          .locator('button:has-text("Log in"), a:has-text("Log in"), button:has-text("Sign up")')
          .first()
          .isVisible()
          .catch(() => false);
        const accountBtn = page
          .locator('button[aria-label*="Google Account:"], [aria-label*="@gmail.com"], [aria-label*="Settings menu"]')
          .first();
        const hasAccountBadge = (await accountBtn.count()) > 0;

        if (loginVisible && !hasAccountBadge) {
          saveFlowMusicAccount({ account: '', status: 'auth_required' });
          throw new Error('Google Flow Music web session is not signed in (Log in button visible)');
        }

        if (hasAccountBadge) {
          const label = (await accountBtn.getAttribute('aria-label')) || (await accountBtn.innerText().catch(() => ''));
          const match = label?.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
          if (match) {
            saveFlowMusicAccount({ account: match[0], status: 'ok' });
          }
        }

        // Start a fresh session if "New session" is available so old songs are not re-captured
        const newSessionBtn = page.locator('button:has-text("New session"), a:has-text("New session")').first();
        if (await newSessionBtn.count() && (await newSessionBtn.isVisible().catch(() => false))) {
          await newSessionBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(1500);
        }

        // Snapshot all pre-existing audio URLs BEFORE submitting the prompt
        const preExistingUrls = new Set<string>(
          await page.evaluate(() =>
            Array.from(document.querySelectorAll('audio'))
              .map((a) => a.getAttribute('src') || a.currentSrc || '')
              .filter(Boolean)
          ).catch(() => [])
        );

        const isNewGeneratedAudioUrl = (url: string): boolean => {
          if (!url || preExistingUrls.has(url)) return false;
          if (KNOWN_DEMO_CLIP_IDS.some((id) => url.includes(id))) return false;
          return true;
        };

        job.stage = 'Entering prompt & lyrics into Google Flow Music composer';
        job.progress = 40;
        job.updatedAt = new Date().toISOString();

        const composer = page.locator('textarea[aria-label="Chat message"], textarea[placeholder*="create" i], textarea').first();
        await composer.waitFor({ state: 'visible', timeout: 20000 });

        const fullPrompt = [
          settings.prompt || 'Cinematic soundtrack music',
          settings.lyrics ? `\nDialogue & Lyrics:\n${settings.lyrics}` : '',
          settings.mood ? `[Mood: ${settings.mood}]` : '',
          settings.vocalProfile ? `[Voice: ${settings.vocalProfile}]` : '',
        ].filter(Boolean).join('\n');

        await composer.click({ force: true }).catch(() => {});
        await composer.fill(fullPrompt).catch(() => {});
        await page.waitForTimeout(1000);
        if ((job.state as string) === 'cancelled') return;

        // Arm network audio capture ONLY right before submitting the new prompt
        let armedAfterSubmit = false;
        page.on('response', async (response: any) => {
          if (!armedAfterSubmit || generatedWithPlaywright) return;
          const url = response.url();
          if (!isNewGeneratedAudioUrl(url)) return;
          const ct = response.headers()['content-type'] || '';
          const looksLikeAudio = ct.includes('audio') || url.includes('.mp3') || url.includes('.m4a') || url.includes('.wav') || url.includes('clips/');
          if (!looksLikeAudio) return;

          try {
            let buffer: Buffer | null = null;
            if (response.status() === 200) {
              buffer = await response.body();
            } else if (response.status() === 206) {
              // Range chunk; fetch complete file via Playwright request context
              const fullRes = await context.request.get(url, { timeout: 20000 }).catch(() => null);
              if (fullRes?.ok()) {
                buffer = await fullRes.body();
              }
            }
            if (buffer && isValidCapturedAudioBuffer(buffer)) {
              fs.writeFileSync(outputFile, buffer);
              if ((await probeAudioDuration(outputFile)) > 1) {
                generatedWithPlaywright = true;
              } else {
                try { fs.unlinkSync(outputFile); } catch {}
              }
            }
          } catch {}
        });

        // Submit prompt
        job.stage = 'Submitting prompt to Google Flow Music Lyria AI engine';
        job.progress = 55;
        job.updatedAt = new Date().toISOString();

        armedAfterSubmit = true;
        const sendBtn = page.locator('button[aria-label="Send message"]');
        if (await sendBtn.count() && (await sendBtn.isEnabled().catch(() => false))) {
          await sendBtn.click({ force: true }).catch(() => {});
        } else {
          await composer.press('Enter').catch(() => {});
        }

        job.stage = 'Composing full music track with Google Flow Music AI';
        job.progress = 65;
        job.updatedAt = new Date().toISOString();

        // Monitor for newly generated track up to 90 seconds
        for (let attempt = 0; attempt < 18; attempt++) {
          if ((job.state as string) === 'cancelled') return;
          await page.waitForTimeout(5000);
          if ((job.state as string) === 'cancelled') return;

          if (generatedWithPlaywright && fs.existsSync(outputFile)) {
            break;
          }

          // Check if a sign-in modal popped up after pressing Send
          const modalLogin = await page
            .locator('[role="dialog"] button:has-text("Log in"), [role="dialog"] button:has-text("Sign in")')
            .first()
            .isVisible()
            .catch(() => false);
          if (modalLogin) {
            saveFlowMusicAccount({ account: '', status: 'auth_required' });
            throw new Error('Google Flow Music requested sign-in after prompt submission');
          }

          // Check for brand-new <audio> elements
          const audioTags = page.locator('audio');
          const audioCount = await audioTags.count();
          if (audioCount > 0) {
            for (let j = 0; j < audioCount; j++) {
              const src = await audioTags.nth(j).getAttribute('src').catch(() => '');
              if (src && src.startsWith('http') && isNewGeneratedAudioUrl(src)) {
                try {
                  const audioData = await page.evaluate(async (url: string) => {
                    const res = await fetch(url);
                    const b = await res.arrayBuffer();
                    return Array.from(new Uint8Array(b));
                  }, src);
                  const buf = Buffer.from(audioData);
                  if (isValidCapturedAudioBuffer(buf)) {
                    fs.writeFileSync(outputFile, buf);
                    if ((await probeAudioDuration(outputFile)) > 1) {
                      generatedWithPlaywright = true;
                      break;
                    } else {
                      try { fs.unlinkSync(outputFile); } catch {}
                    }
                  }
                } catch {}
              }
            }
            if (generatedWithPlaywright) break;
          }

          // Check for download button
          const dlBtn = page.locator('button[aria-label*="download" i], a[download]').first();
          if (await dlBtn.count() && (await dlBtn.isVisible().catch(() => false))) {
            const dlPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
            await dlBtn.click({ force: true }).catch(() => {});
            const dl = await dlPromise;
            if (dl) {
              await dl.saveAs(outputFile);
              if ((await probeAudioDuration(outputFile)) > 1) {
                generatedWithPlaywright = true;
                break;
              } else {
                try { fs.unlinkSync(outputFile); } catch {}
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Flow Music] Playwright live generation skipped: ${err?.message}. Engaging local AI song engine...`);
      } finally {
        if (context) {
          await context.close().catch(() => {});
        }
      }
    }

    if ((job.state as string) === 'cancelled') return;

    // Step 2: Local ACE-Step 1.5 singing-song engine (ComfyUI) if Flow Music web was not captured
    if (!generatedWithPlaywright || !fs.existsSync(outputFile)) {
      const aceResult = await synthesizeSongWithAceStep(
        settings,
        outputFile,
        settings.duration || 60,
        {
          shouldCancel: () => (job.state as string) === 'cancelled',
          onStage: (stage, progress) => {
            job.stage = stage;
            job.progress = progress;
            job.updatedAt = new Date().toISOString();
          },
        }
      ).catch((err: any) => {
        console.warn(`[Flow Music] ACE-Step 1.5 note: ${err?.message}`);
        return null;
      });

      if ((job.state as string) === 'cancelled') {
        try { fs.unlinkSync(outputFile); } catch {}
        return;
      }

      if (aceResult && fs.existsSync(outputFile)) {
        usedEngine = 'acestep-1.5';
        job.transcription = aceResult.transcription;
      } else {
        // Step 3: Clean multi-track vocal + instrumental synthesizer fallback
        usedEngine = 'synthesizer';
        job.stage = 'Synthesizing studio vocals & musical arrangement (Lyrics, Drums, Chords)';
        job.progress = 85;
        job.updatedAt = new Date().toISOString();
        const songResult = await synthesizeFullSongTrack(settings, outputFile, settings.duration || 60);
        job.transcription = songResult.transcription;
      }
    } else {
      job.stage = 'Transcribing and verifying vocal lyrics with Whisper AI...';
      job.progress = 92;
      job.updatedAt = new Date().toISOString();
      const transcription = await transcribeSongAudio(outputFile).catch(() => '');
      job.transcription = transcription;
    }

    if ((job.state as string) === 'cancelled') {
      try { fs.unlinkSync(outputFile); } catch {}
      return;
    }

    // Convert captured web stream to clean 48kHz stereo MP3 if needed
    if (usedEngine === 'flowmusic.app' && fs.existsSync(outputFile)) {
      const convertedFile = path.join(downloadsDir, `${jobId}_conv.mp3`);
      try {
        const { execSync } = await import('node:child_process');
        execSync(`ffmpeg -y -i "${outputFile}" -ar 48000 -ac 2 -c:a libmp3lame -b:a 192k "${convertedFile}"`, { stdio: 'ignore' });
        if (fs.existsSync(convertedFile) && fs.statSync(convertedFile).size > 1000) {
          fs.copyFileSync(convertedFile, outputFile);
          try { fs.unlinkSync(convertedFile); } catch {}
        }
      } catch {}
    }

    const trackMeta = {
      id: jobId,
      scriptId,
      engine: usedEngine,
      title: settings.title?.trim() || 'Generated Flow Music Track',
      prompt: settings.prompt || '',
      transcription: job.transcription || '',
      createdAt: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(path.join(downloadsDir, `${jobId}.json`), JSON.stringify(trackMeta, null, 2), 'utf8');
    } catch {}

    // Copy to script's workspace only when scriptId belongs to a stored workspace script
    const destFilename = `flow_music_${jobId}.mp3`;
    const script = store.getById<any>('scripts', scriptId);
    let downloadUrl = `/api/flow-music/downloads/${jobId}`;
    let scriptDest = outputFile;
    if (script) {
      scriptDest = containedFile(generatedDir(), scriptId, destFilename);
      fs.mkdirSync(path.dirname(scriptDest), { recursive: true });
      fs.copyFileSync(outputFile, scriptDest);
      const scriptUrl = mediaUrl(`generate/file/${scriptId}/${destFilename}`);
      const musicEntry = {
        filename: destFilename,
        url: scriptUrl,
        prompt: settings.prompt,
        duration: settings.duration || 60,
        seed: Math.floor(Math.random() * 1000000),
        contextHash: `flow_music_${jobId}`,
        transcription: job.transcription || '',
        createdAt: new Date().toISOString(),
        settings,
      };
      script.generatedMusic = musicEntry;
      store.add('scripts', { ...script, generatedMusic: musicEntry });
      downloadUrl = scriptUrl;
    }

    // A freshly generated track always requires a fresh listen & approval
    try {
      const { setSongApproval } = await import('./flow-music-video-service.js');
      setSongApproval(scriptId, false, '', '');
    } catch {}

    job.state = 'done';
    job.stage =
      usedEngine === 'flowmusic.app'
        ? 'Google Flow Music generated successfully! Listen, then Approve or Reject.'
        : usedEngine === 'acestep-1.5'
          ? 'AI song with vocals generated via ACE-Step 1.5! Listen, then Approve or Reject.'
          : 'Vocal & music mix synthesized! Listen, then Approve or Reject.';
    job.progress = 100;
    job.audioPath = scriptDest;
    job.downloadUrl = downloadUrl;
    job.updatedAt = new Date().toISOString();
  })().catch((fatal: any) => {
    if ((job.state as string) === 'cancelled') return;
    job.state = 'error';
    job.stage = 'Generation failed';
    job.error = fatal?.message || 'Unknown error during Google Flow Music generation';
    job.updatedAt = new Date().toISOString();
  });

  return job;
}
