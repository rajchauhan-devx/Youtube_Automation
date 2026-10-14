import fs from 'node:fs';
import path from 'node:path';
import { generatedDir, mediaUrl, currentWorkspace } from './workspace.js';
import {
  ComfyError,
  sanitizeSegment,
  preparePromptForImageGeneration,
  resolveChannelLoraForAccount,
} from './comfyui.js';

import { isAdcConfigured, getGoogleAuthToken } from './google-adc.js';

export interface GoogleImageOptions {
  scriptId: string;
  index: number;
  prompt: string;
  seed?: number;
  signal?: AbortSignal;
  filePrefix?: string;
  force2dStylized?: boolean;
  modelName?: string;
}

export function isGoogleImageConfigured(): boolean {
  return Boolean(
    (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) ||
    isAdcConfigured()
  );
}

const GOOGLE_IMAGE_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image',
  'gemini-2.5-flash-image',
];

export async function generateGoogleImage(opts: GoogleImageOptions): Promise<{
  publicUrl: string;
  fileName: string;
  seed: number;
  elapsedMs: number;
  loraFileName?: string;
  provider: 'google';
  model: string;
  endpointId: string;
  endpointLabel: string;
  attempts: number;
}> {
  const started = Date.now();
  const scriptId = sanitizeSegment(opts.scriptId);
  if (!scriptId) throw new ComfyError('CONFIG', 'Invalid scriptId.');

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const adcAuth = await getGoogleAuthToken();
  if (!apiKey && !adcAuth) {
    throw new ComfyError(
      'CONFIG',
      'No Google Cloud authentication found. Provide GEMINI_API_KEY in server/.env or configure Application Default Credentials (ADC).'
    );
  }

  const rawPrefix = opts.filePrefix || 'image';
  const prefix = path.basename(rawPrefix).replace(/[^a-zA-Z0-9_-]/g, '') || 'image';
  const landscape = currentWorkspace().profile !== 'shorts';
  const aspectRatio = landscape ? '16:9' : '9:16';

  const accountId = currentWorkspace().accountId || 'default';
  const channelLora = resolveChannelLoraForAccount(accountId);

  const prepared = preparePromptForImageGeneration(opts.prompt, {
    forCloudflare: false,
    injectStyleDna: true,
    styleDna: channelLora.styleDna,
    force2dStylized: opts.force2dStylized,
  });
  const effectivePrompt = prepared.positivePrompt;

  const candidateModels = opts.modelName
    ? [opts.modelName, ...GOOGLE_IMAGE_MODELS.filter((m) => m !== opts.modelName)]
    : GOOGLE_IMAGE_MODELS;

  let lastErrorText = '';
  let attempts = 0;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (adcAuth) {
    headers['Authorization'] = `Bearer ${adcAuth.token}`;
    if (adcAuth.projectId) {
      headers['X-Goog-User-Project'] = adcAuth.projectId;
    }
  }

  for (const model of candidateModels) {
    const endpointsToTry: string[] = [];
    if (adcAuth && adcAuth.projectId) {
      endpointsToTry.push(
        `https://aiplatform.googleapis.com/v1/projects/${adcAuth.projectId}/locations/global/publishers/google/models/${model}:generateContent`
      );
      endpointsToTry.push(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${adcAuth.projectId}/locations/us-central1/publishers/google/models/${model}:generateContent`
      );
    }
    if (apiKey) {
      endpointsToTry.push(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      );
    } else if (adcAuth) {
      endpointsToTry.push(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      );
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: effectivePrompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio,
        },
      },
    };

    let res: Response | undefined;
    for (const url of endpointsToTry) {
      attempts++;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: opts.signal,
        });
      } catch (err: any) {
        if (opts.signal?.aborted) throw new ComfyError('CANCELLED', 'Image generation was cancelled.');
        lastErrorText = err.message || 'fetch failed';
        continue;
      }

      if (res.ok) {
        break;
      }

      const errorText = await res.text().catch(() => '');
      lastErrorText = errorText;

      // If rate limited or unbilled FreeTier on this endpoint, try next endpoint
      if (res.status === 429 && /free_tier.*limit:\s*0/i.test(errorText)) {
        continue;
      }
      if (res.status === 404 || res.status === 503) {
        continue;
      }
    }

    if (!res || !res.ok) {
      if (res?.status === 429 && /free_tier.*limit:\s*0/i.test(lastErrorText)) {
        throw new ComfyError(
          'RATE_LIMITED',
          'Google Cloud Image Generation requires a billing-enabled project. Link your Google Cloud project with the $300 credit or run the ADC setup script to enable image generation.',
          { raw: lastErrorText }
        );
      }
      continue;
    }

    const data = (await res.json()) as any;
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p.inline_data || p.inlineData);
    const b64 = imagePart?.inline_data?.data || imagePart?.inlineData?.data;

    if (!b64) {
      // Sometimes returned text filter warning
      const textMsg = parts.map((p: any) => p.text || '').join(' ').trim();
      throw new ComfyError(
        'NO_OUTPUT',
        textMsg || 'Google Cloud image generation returned no image data (safety filter or empty output).'
      );
    }

    const imgBuffer = Buffer.from(b64, 'base64');
    const baseDir = path.resolve(generatedDir());
    const outDir = path.resolve(baseDir, scriptId);

    // Path boundary verification
    if (!outDir.startsWith(baseDir + path.sep)) {
      throw new ComfyError('CONFIG', 'Invalid script directory path.');
    }

    fs.mkdirSync(outDir, { recursive: true });
    const fileName = `${prefix}-${String(opts.index).padStart(2, '0')}-${started}.png`;
    const targetFile = path.join(outDir, fileName);
    fs.writeFileSync(targetFile, imgBuffer);

    return {
      publicUrl: mediaUrl(`generate/file/${scriptId}/${fileName}`),
      fileName,
      seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
      elapsedMs: Date.now() - started,
      loraFileName: undefined,
      provider: 'google',
      model,
      endpointId: 'google-cloud-image',
      endpointLabel: 'Google Cloud (Gemini Image)',
      attempts,
    };
  }

  throw new ComfyError(
    'GENERATION_ERROR',
    `Google Cloud image generation failed on all models: ${lastErrorText.slice(0, 300)}`
  );
}
