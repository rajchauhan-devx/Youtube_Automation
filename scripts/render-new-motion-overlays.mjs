import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'new_motion_overlays');
fs.mkdirSync(outDir, { recursive: true });

const { chromium } = await import(path.join(root, 'server', 'node_modules', 'playwright', 'index.mjs'));

console.log('Rendering new visual motion overlays to PNG...');

const items = [
  {
    filename: 'heartbeat_pulse_overlay.png',
    title: 'Heartbeat EKG Pulse Monitor',
    html: `
      <div style="position: absolute; top: 380px; left: 50%; transform: translateX(-50%); width: 720px; height: 380px; display: flex; flex-direction: column; align-items: center;">
        <svg viewBox="0 0 340 180" style="width: 100%; height: 100%; filter: drop-shadow(0 0 24px #10B981); overflow: visible;">
          <defs>
            <filter id="ekgGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#10B981" stroke-width="0.5" opacity="0.15" />
            </pattern>
          </defs>
          <rect width="340" height="180" fill="url(#grid)" rx="8" />
          <rect width="340" height="180" fill="none" stroke="#10B981" stroke-width="1.5" opacity="0.3" rx="8" />
          <line x1="10" y1="90" x2="330" y2="90" stroke="#10B981" stroke-width="0.8" stroke-dasharray="3,3" opacity="0.4" />
          <path d="M 10 90 L 70 90 L 85 82 L 95 90 L 115 90 L 125 135 L 140 25 L 155 150 L 165 90 L 185 90 L 200 78 L 220 90 L 240 90 L 250 135 L 265 25 L 280 150 L 290 90 L 330 90"
                fill="none" stroke="#10B981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
                filter="url(#ekgGlow)" />
          <circle cx="265" cy="25" r="5" fill="#FFFFFF" filter="url(#ekgGlow)" />
        </svg>
        <div style="display: flex; align-items: center; justify-content: space-between; width: 620px; margin-top: 16px;">
          <span style="color: #10B981; font-family: monospace; font-size: 24px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase;">● EKG // VITALS MONITOR</span>
          <span style="color: #FFFFFF; font-family: monospace; font-size: 28px; font-weight: 900; background: rgba(0,0,0,0.65); padding: 4px 16px; border-radius: 8px; border: 1.5px solid #10B981; box-shadow: 0 0 16px rgba(16,185,129,0.5);">148 BPM</span>
        </div>
      </div>
    `
  },
  {
    filename: 'chakra_mandala_overlay.png',
    title: 'Rotating Vedic Golden Chakra Mandala',
    html: `
      <div style="position: absolute; top: 320px; left: 50%; transform: translateX(-50%); width: 640px; height: 640px; display: flex; flex-direction: column; align-items: center;">
        <svg viewBox="0 0 300 300" style="width: 100%; height: 100%; filter: drop-shadow(0 0 28px #F59E0B); overflow: visible;">
          <defs>
            <filter id="chakraGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="150" cy="150" r="135" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-dasharray="4,8" opacity="0.75" />
          <circle cx="150" cy="150" r="120" fill="none" stroke="#F59E0B" stroke-width="1.8" opacity="0.55" />
          <g filter="url(#chakraGlow)">
            ${Array.from({ length: 12 }).map((_, i) => {
              const deg = i * 30;
              const rad = (deg * Math.PI) / 180;
              const x2 = 150 + 115 * Math.cos(rad);
              const y2 = 150 + 115 * Math.sin(rad);
              return `<line x1="150" y1="150" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#F59E0B" stroke-width="2.5" />`;
            }).join('')}
            ${Array.from({ length: 12 }).map((_, i) => {
              const deg = i * 30;
              const rad = (deg * Math.PI) / 180;
              const cx = 150 + 120 * Math.cos(rad);
              const cy = 150 + 120 * Math.sin(rad);
              return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="#FDE68A" />`;
            }).join('')}
            <circle cx="150" cy="150" r="75" fill="none" stroke="#FDE68A" stroke-width="2.5" stroke-dasharray="6,4" />
            <circle cx="150" cy="150" r="45" fill="none" stroke="#F59E0B" stroke-width="2.5" />
          </g>
          <circle cx="150" cy="150" r="22" fill="#F59E0B" filter="url(#chakraGlow)" />
          <circle cx="150" cy="150" r="12" fill="#FFFFFF" />
        </svg>
        <div style="text-align: center; margin-top: 24px;">
          <div style="color: #F59E0B; font-family: sans-serif; font-size: 32px; font-weight: 900; letter-spacing: 0.14em; text-shadow: 0 0 20px #F59E0B;">कालचक्र // YUGA CYCLE</div>
          <div style="color: #FDE68A; font-family: sans-serif; font-size: 20px; font-weight: 700; margin-top: 6px; letter-spacing: 0.08em; text-shadow: 0 0 10px #F59E0B;">SACRED SOLAR MANDALA</div>
        </div>
      </div>
    `
  }
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

for (const item of items) {
  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 1080px;
            height: 1920px;
            background: transparent;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        ${item.html}
      </body>
    </html>
  `;
  await page.setContent(fullHtml, { waitUntil: 'load' });
  const outPath = path.join(outDir, item.filename);
  await page.screenshot({ path: outPath, omitBackground: true });
  console.log(`Rendered: ${outPath} (${fs.statSync(outPath).size} bytes)`);
}

await browser.close();
console.log('Done rendering new overlays!');
