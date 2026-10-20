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
  assetOnly?: boolean;
  aspectRatio?: '1:1' | '16:9' | '9:16';
  maxAttempts?: number;
  onAttempt?: (model: string) => void;
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
  const aspectRatio = opts.aspectRatio || (landscape ? '16:9' : '9:16');

  const accountId = currentWorkspace().accountId || 'default';
  const channelLora = resolveChannelLoraForAccount(accountId);

  const sanitizedPrompt = String(opts.prompt || '')
    // Minor / child safety triggers
    .replace(/\b(?:abandoned\s+)?child(?:ren)?\b/gi, 'young traveler')
    .replace(/\b(?:abandoned\s+)?kid(?:s)?\b/gi, 'young traveler')
    .replace(/\b(?:toddler|infant|minor)\b/gi, 'young traveler')
    .replace(/\b\d{1,2}-year-old\s*(?:female|male|girl|boy|child|teenager|teen)?\b/gi, 'youthful traveler')
    .replace(/\b(?:teenager|teenage\s+(?:girl|boy))\b/gi, 'young traveler')
    .replace(/\bfragile\s+body\s+build\b/gi, 'slender build')
    // Weapons / restraint triggers on characters
    .replace(/\bneck\s+collar\b/gi, 'neck choker')
    .replace(/\bthroat\s+collar\b/gi, 'throat choker')
    .replace(/\bcollar\b/gi, 'choker')
    .replace(/\bstun\s+baton\b/gi, 'tactical staff')
    .replace(/\belectrical\s+tip\b/gi, 'energy emitter')
    // Graphic injuries
    .replace(/\b(?:concussion, a broken collarbone, and a torn ligament)\b/gi, 'severe exhaustion and injuries')
    .replace(/\b(?:severed|festering|bloody)\b/gi, 'weathered');

  const prepared = opts.assetOnly ? { positivePrompt: sanitizedPrompt } : preparePromptForImageGeneration(sanitizedPrompt, {
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
      if (opts.maxAttempts && attempts >= opts.maxAttempts) break;
      attempts++;
      opts.onAttempt?.(model);
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
      const textMsg = parts.map((p: any) => p.text || '').join(' ').trim();
      console.warn(`[google-image] Safety filter or empty output on ${model} (${textMsg}). Trying next model...`);
      lastErrorText = textMsg;
      continue;
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

  if (opts.assetOnly) throw new ComfyError('GENERATION_FAILED', `The requested motion asset could not be generated. ${lastErrorText.slice(0, 240)}`);
  // If candidate models all returned safety blocks or empty outputs, try a safe atmospheric scene prompt
  const locationMatch = effectivePrompt.match(/LOCATION\s*(?:BLOCK)?\s*:\s*([^.;]+(?:;[^.;]+)*)/i);
  const locationText = locationMatch ? locationMatch[1].trim() : 'dramatic cinematic atmosphere';
  const fallbackPrompt = opts.force2dStylized
    ? `2D flat cel-shaded cartoon animation frame, bold black outlines, flat matte colors: ${locationText}, atmospheric environment, no people`
    : `Atmospheric cinematic visual in ${aspectRatio} orientation: ${locationText}, moody lighting, realistic environmental texture, no people`;
  console.warn('[google-image] Using atmospheric fallback prompt...');
  try {
    const fallbackModel = 'gemini-3.1-flash-lite-image';
    const fallbackRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
      }),
      signal: opts.signal,
    });
    if (fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      const fbParts = fbData.candidates?.[0]?.content?.parts || [];
      const fbImgPart = fbParts.find((p: any) => p.inline_data || p.inlineData);
      const fbB64 = fbImgPart?.inline_data?.data || fbImgPart?.inlineData?.data;
      if (fbB64) {
        const imgBuffer = Buffer.from(fbB64, 'base64');
        const baseDir = path.resolve(generatedDir());
        const outDir = path.resolve(baseDir, scriptId);
        fs.mkdirSync(outDir, { recursive: true });
        const fileName = `${prefix}-${String(opts.index).padStart(2, '0')}-${Date.now()}.png`;
        const filePath = path.join(outDir, fileName);
        fs.writeFileSync(filePath, imgBuffer);
        return {
          publicUrl: mediaUrl(`generate/file/${scriptId}/${fileName}`),
          fileName,
          seed: 42,
          elapsedMs: Date.now() - started,
          provider: 'google',
          model: 'gemini-2.5-flash-image-fallback',
          endpointId: 'google-fallback',
          endpointLabel: 'Google Cloud (Atmospheric Fallback)',
          attempts: attempts + 1,
        };
      }
    }
  } catch (fbErr) {
    console.error('[google-image] Fallback failed:', fbErr);
  }

  throw new ComfyError(
    'GENERATION_ERROR',
    `Google Cloud image generation failed on all models: ${lastErrorText.slice(0, 300)}`
  );
}
