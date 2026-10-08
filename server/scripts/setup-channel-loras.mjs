#!/usr/bin/env node
/**
 * Setup & Download the 3 Channel-Isolated SDXL 1.0 LoRAs for Juggernaut XL.
 *
 * Each channel is strictly isolated to its own LoRA file in ComfyUI/models/loras/:
 *   1. Ancient Dharma (My Channel)      -> ancient_dharma_chiaroscuro_xl.safetensors
 *   2. Rule Zero (zero rule)            -> rule_zero_dark_contrast_xl.safetensors
 *   3. Against the Odds                 -> against_the_odds_analog_film_xl.safetensors
 *
 * Usage:
 *   npm run setup:loras
 *   node server/scripts/setup-channel-loras.mjs [--channel ancient_dharma|rule_zero|against_the_odds] [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

export const CHANNEL_LORA_REGISTRY = {
  ancient_dharma: {
    channelId: 'ancient_dharma',
    channelNames: ['Ancient Dharma', 'My Channel'],
    loraTitle: 'Chiaroscuro Fantasy XL (Sacred Temple & Mythic Oil Glow)',
    fileName: 'ancient_dharma_chiaroscuro_xl.safetensors',
    customFileName: 'ancient_dharma_custom_xl.safetensors',
    civitaiModelId: 570685,
    civitaiUrl: 'https://civitai.com/models/570685',
    downloadUrl: 'https://civitai.com/api/download/models/675431',
    expectedMinBytes: 150 * 1024 * 1024,
    strengthModel: 0.70,
    strengthClip: 0.70,
    triggerWords: ['ArsMJStyle', 'chiaroscuro lighting', 'warm golden oil lamp glow'],
    styleDnaPrompt:
      'Sacred chiaroscuro lighting, warm golden oil-lamp glow, deep carved-stone temple shadows, volumetric incense haze, burnished gold and saffron color palette, painterly mythological photorealism.',
  },
  rule_zero: {
    channelId: 'rule_zero',
    channelNames: ['Rule Zero', 'zero rule'],
    loraTitle: "Zavy's Dark Atmospheric Contrast XL (Neo-Noir Psychological Thriller)",
    fileName: 'rule_zero_dark_contrast_xl.safetensors',
    customFileName: 'rule_zero_custom_xl.safetensors',
    civitaiModelId: 295530,
    civitaiUrl: 'https://civitai.com/models/295530',
    downloadUrl: 'https://civitai.com/api/download/models/332071',
    expectedMinBytes: 150 * 1024 * 1024,
    strengthModel: 0.75,
    strengthClip: 0.75,
    triggerWords: ['dark', 'chiaroscuro', 'low-key'],
    styleDnaPrompt:
      'Dark atmospheric contrast, low-key Fincher neo-noir cinematography, deep crushed obsidian shadows, cold cyan glass reflections contrasted with warm tungsten rim light, high-tension thriller mood.',
  },
  against_the_odds: {
    channelId: 'against_the_odds',
    channelNames: ['Against the Odds', 'Against the odds'],
    loraTitle: 'Analog Film XL v1 (Raw 35mm Documentary Photojournalism)',
    fileName: 'against_the_odds_analog_film_xl.safetensors',
    customFileName: 'against_the_odds_custom_xl.safetensors',
    civitaiModelId: 181012,
    civitaiUrl: 'https://civitai.com/models/181012',
    downloadUrl: 'https://civitai.com/api/download/models/203145',
    expectedMinBytes: 80 * 1024 * 1024,
    strengthModel: 0.80,
    strengthClip: 0.80,
    triggerWords: ['Analog Film Style', 'Analog Film', '35mm documentary film'],
    styleDnaPrompt:
      'Analog Film Style, raw 1970s 35mm Kodak documentary photojournalism, gritty analog film grain, subtle halation, weathered skin pores and frost/mud micro-textures, desaturated natural storm palette.',
  },
};

function resolveComfyLorasDir() {
  const envComfy = process.env.COMFYUI_PATH;
  const candidates = [
    envComfy && path.isAbsolute(envComfy) ? envComfy : null,
    envComfy ? path.resolve(SERVER_ROOT, envComfy) : null,
    envComfy ? path.resolve(REPO_ROOT, envComfy) : null,
    path.join(REPO_ROOT, 'ComfyUI'),
    path.join(SERVER_ROOT, 'ComfyUI'),
  ].filter(Boolean);

  const comfyRoot = candidates.find((dir) => fs.existsSync(dir)) || path.join(REPO_ROOT, 'ComfyUI');
  const lorasDir = path.join(comfyRoot, 'models', 'loras');
  fs.mkdirSync(lorasDir, { recursive: true });
  return lorasDir;
}

async function downloadFileWithProgress(url, destPath, label) {
  const tmpPath = `${destPath}.part`;
  const headers = {
    'User-Agent': 'TubeFlow-LoRA-Setup/1.0',
  };
  if (process.env.CIVITAI_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.CIVITAI_API_KEY}`;
  }

  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} when downloading ${label} from ${url}`);
  }

  const totalBytes = Number(res.headers.get('content-length') || 0);
  const totalMB = totalBytes ? (totalBytes / 1024 / 1024).toFixed(1) : '?';
  console.log(`  ↓ Downloading ${label} (${totalMB} MB)...`);

  const fileStream = fs.createWriteStream(tmpPath);
  let downloaded = 0;
  let lastLoggedPct = -1;

  const nodeReadable = Readable.fromWeb(res.body);
  nodeReadable.on('data', (chunk) => {
    downloaded += chunk.length;
    if (totalBytes > 0) {
      const pct = Math.floor((downloaded / totalBytes) * 100);
      if (pct >= lastLoggedPct + 20) {
        lastLoggedPct = pct;
        const doneMB = (downloaded / 1024 / 1024).toFixed(1);
        console.log(`    [${pct}%] ${doneMB} / ${totalMB} MB`);
      }
    }
  });

  await pipeline(nodeReadable, fileStream);
  fs.renameSync(tmpPath, destPath);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const chIdx = args.indexOf('--channel');
  const onlyChannel = chIdx >= 0 ? args[chIdx + 1] : null;

  const lorasDir = resolveComfyLorasDir();
  console.log('===============================================================');
  console.log(' TubeFlow — 3-Channel Isolated Juggernaut XL LoRA Setup');
  console.log(` Target directory: ${lorasDir}`);
  console.log('===============================================================\n');

  const entries = Object.values(CHANNEL_LORA_REGISTRY).filter(
    (entry) => !onlyChannel || entry.channelId === onlyChannel,
  );

  if (entries.length === 0) {
    console.error(`Unknown --channel "${onlyChannel}". Valid options: ancient_dharma, rule_zero, against_the_odds`);
    process.exit(1);
  }

  for (const entry of entries) {
    const destPath = path.join(lorasDir, entry.fileName);
    const exists = fs.existsSync(destPath);
    const size = exists ? fs.statSync(destPath).size : 0;

    console.log(`[${entry.channelId}] ${entry.loraTitle}`);
    console.log(`  • Channel(s): ${entry.channelNames.join(' / ')}`);
    console.log(`  • LoRA File:  ${entry.fileName}`);
    console.log(`  • Source:     ${entry.civitaiUrl}`);

    if (exists && size >= entry.expectedMinBytes && !force) {
      console.log(`  ✓ Already installed (${(size / 1024 / 1024).toFixed(1)} MB) — skipping download.\n`);
      continue;
    }

    await downloadFileWithProgress(entry.downloadUrl, destPath, entry.fileName);
    const finalSize = fs.statSync(destPath).size;
    console.log(`  ✓ Installed ${entry.fileName} (${(finalSize / 1024 / 1024).toFixed(1)} MB)\n`);
  }

  const manifestPath = path.join(lorasDir, 'channel-lora-manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        baseCheckpoint: 'juggernautXL_ragnarok.safetensors',
        strictChannelIsolation: true,
        channels: CHANNEL_LORA_REGISTRY,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`✓ Wrote channel LoRA manifest: ${manifestPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('LoRA setup failed:', err);
    process.exit(1);
  });
}
