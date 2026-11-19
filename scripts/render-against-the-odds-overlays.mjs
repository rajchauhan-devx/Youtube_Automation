import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'against_the_odds_overlays');
fs.mkdirSync(outDir, { recursive: true });

// Import Playwright Chromium from server
const { chromium } = await import(path.join(root, 'server', 'node_modules', 'playwright', 'index.mjs'));

console.log('=== RENDERING 7 OPEN-SOURCE MOTION GRAPHICS OVERLAYS (1080x1920) ===\n');

const overlays = [
  {
    filename: 'overlay_01_title_intro.png',
    title: 'Scene 1: Cinematic Title Intro (Remotion Template)',
    html: `
      <div style="position: absolute; top: 180px; left: 60px; right: 60px; display: flex; flex-direction: column; align-items: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: rgba(15, 23, 42, 0.88); border: 1.5px solid rgba(250, 204, 21, 0.45); border-radius: 24px; padding: 36px 48px; box-shadow: 0 20px 50px rgba(0,0,0,0.7), 0 0 30px rgba(250, 204, 21, 0.2); backdrop-filter: blur(16px); text-align: center; max-width: 900px; width: 100%;">
          
          <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(250, 204, 21, 0.15); border: 1px solid rgba(250, 204, 21, 0.4); border-radius: 999px; padding: 8px 20px; margin-bottom: 20px;">
            <span style="font-size: 16px;">⚡</span>
            <span style="color: #FACC15; font-size: 14px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;">AGAINST THE ODDS</span>
          </div>

          <h1 style="color: #FFFFFF; font-size: 52px; font-weight: 900; line-height: 1.15; margin: 0 0 14px 0; letter-spacing: -0.02em; text-transform: uppercase;">
            THE ENDURANCE<br/><span style="color: #FACC15;">EXPEDITION</span>
          </h1>

          <div style="height: 3px; width: 140px; background: linear-gradient(90deg, transparent, #FACC15, transparent); margin: 0 auto 16px auto;"></div>

          <p style="color: #E2E8F0; font-size: 22px; font-weight: 500; margin: 0; letter-spacing: 0.02em;">
            Antarctic Ice Pack · April 1916
          </p>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_02_target_reticle.png',
    title: 'Scene 2: Tactical Reticle & Location Callout (Lottie + Remotion)',
    html: `
      <!-- Rotating Tactical Reticle -->
      <div style="position: absolute; top: 780px; left: 160px; width: 180px; height: 180px;">
        <svg viewBox="0 0 100 100" style="width: 100%; height: 100%; filter: drop-shadow(0 0 10px #00E5FF);">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#00E5FF" stroke-width="2" stroke-dasharray="6,4" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#00E5FF" stroke-width="1.5" stroke-dasharray="14,6" opacity="0.8" />
          <circle cx="50" cy="50" r="6" fill="#00E5FF" />
          <line x1="10" y1="50" x2="35" y2="50" stroke="#00E5FF" stroke-width="2" />
          <line x1="65" y1="50" x2="90" y2="50" stroke="#00E5FF" stroke-width="2" />
          <line x1="50" y1="10" x2="50" y2="35" stroke="#00E5FF" stroke-width="2" />
          <line x1="50" y1="65" x2="50" y2="90" stroke="#00E5FF" stroke-width="2" />
        </svg>
      </div>

      <!-- Attached Callout Card -->
      <div style="position: absolute; top: 790px; left: 370px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: rgba(15, 23, 42, 0.90); border: 1.5px solid #00E5FF; border-left: 5px solid #00E5FF; border-radius: 16px; padding: 22px 28px; box-shadow: 0 16px 40px rgba(0,0,0,0.8), 0 0 24px rgba(0, 229, 255, 0.25); backdrop-filter: blur(16px); min-width: 440px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="color: #00E5FF; font-size: 13px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;">📍 LANDFALL VERIFIED</span>
          </div>
          <h2 style="color: #FFFFFF; font-size: 32px; font-weight: 800; margin: 0 0 6px 0;">
            ELEPHANT ISLAND
          </h2>
          <p style="color: #94A3B8; font-family: monospace; font-size: 18px; margin: 0;">
            61°08'S 55°07'W · 28 Men Alive
          </p>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_03_alert_quote.png',
    title: 'Scene 3: Alert Triangle & Pull Quote (Lottie Alert + Quote Card)',
    html: `
      <div style="position: absolute; bottom: 320px; left: 70px; right: 70px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: rgba(15, 23, 42, 0.92); border: 1.5px solid rgba(245, 158, 11, 0.5); border-radius: 24px; padding: 36px 40px; box-shadow: 0 24px 50px rgba(0,0,0,0.85), 0 0 35px rgba(245, 158, 11, 0.2); backdrop-filter: blur(16px);">
          
          <div style="display: flex; items-center; gap: 14px; margin-bottom: 16px;">
            <svg viewBox="0 0 24 24" style="width: 38px; height: 38px; fill: #F59E0B; filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.6));">
              <path d="M12 2L1 21h22L12 2zm0 3.8L20.1 19H3.9L12 5.8zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
            </svg>
            <div>
              <span style="color: #F59E0B; font-size: 13px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;">CRITICAL REALIZATION</span>
              <p style="color: #E2E8F0; font-size: 15px; margin: 2px 0 0 0;">Zero chance of passing maritime traffic</p>
            </div>
          </div>

          <p style="color: #FFFFFF; font-size: 28px; font-weight: 500; font-style: italic; line-height: 1.4; margin: 0 0 16px 0;">
            "Rescue ships would never find them on the remote, desolate shore..."
          </p>

          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
            <span style="color: #94A3B8; font-size: 14px; font-family: monospace;">LOG ENTRY:</span>
            <span style="color: #FACC15; font-size: 15px; font-weight: 700;">ELEPHANT ISLAND, 1916</span>
          </div>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_04_voyage_telemetry.png',
    title: 'Scene 4: Bouncing Arrow & Stat Counter (Lottie Arrow + 800 Miles)',
    html: `
      <!-- Bouncing Arrow -->
      <div style="position: absolute; top: 980px; left: 50%; transform: translateX(-50%); width: 100px; height: 100px;">
        <svg viewBox="0 0 100 100" style="width: 100%; height: 100%; filter: drop-shadow(0 0 12px #FACC15);">
          <path d="M50 80 L20 40 L40 40 L40 10 L60 10 L60 40 L80 40 Z" fill="#FACC15" stroke="#FFFFFF" stroke-width="3" />
        </svg>
      </div>

      <!-- Stat Counter Box -->
      <div style="position: absolute; bottom: 300px; left: 80px; right: 80px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: rgba(15, 23, 42, 0.92); border: 2px solid #FACC15; border-radius: 24px; padding: 32px; box-shadow: 0 24px 60px rgba(0,0,0,0.85), 0 0 35px rgba(250, 204, 21, 0.3); backdrop-filter: blur(16px); text-align: center;">
          <div style="display: inline-block; background: rgba(250, 204, 21, 0.15); border: 1px solid rgba(250, 204, 21, 0.4); border-radius: 999px; padding: 6px 18px; margin-bottom: 12px;">
            <span style="color: #FACC15; font-size: 13px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;">OPEN-OCEAN VOYAGE</span>
          </div>

          <div style="display: flex; align-items: baseline; justify-content: center; gap: 12px; margin: 4px 0 8px 0;">
            <span style="color: #FFFFFF; font-size: 84px; font-weight: 900; line-height: 1; letter-spacing: -0.03em;">800</span>
            <span style="color: #FACC15; font-size: 38px; font-weight: 900; text-transform: uppercase;">MILES</span>
          </div>

          <p style="color: #E2E8F0; font-size: 22px; font-weight: 600; margin: 0 0 4px 0;">
            22-Foot Open Boat <span style="color: #FACC15;">James Caird</span>
          </p>
          <p style="color: #94A3B8; font-size: 16px; margin: 0;">
            Across the Ferocious Southern Ocean
          </p>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_05_shackleton_lower_third.png',
    title: 'Scene 5: Broadcast Lower-Third Banner (Remotion Lower Third)',
    html: `
      <div style="position: absolute; bottom: 320px; left: 60px; right: 60px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="display: flex; align-items: stretch; background: rgba(15, 23, 42, 0.92); border: 1.5px solid rgba(250, 204, 21, 0.35); border-radius: 20px; overflow: hidden; box-shadow: 0 24px 50px rgba(0,0,0,0.85), 0 0 25px rgba(250, 204, 21, 0.2); backdrop-filter: blur(16px);">
          
          <!-- Golden Accent Strip -->
          <div style="width: 14px; background: linear-gradient(180deg, #FDE047, #D97706); flex-shrink: 0;"></div>

          <div style="padding: 26px 36px; flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="color: #FACC15; font-size: 12px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;">LEADERSHIP PROFILE</span>
            </div>

            <h2 style="color: #FFFFFF; font-size: 38px; font-weight: 900; margin: 0 0 6px 0; letter-spacing: -0.01em; text-transform: uppercase;">
              SIR ERNEST SHACKLETON
            </h2>

            <p style="color: #FACC15; font-size: 20px; font-weight: 600; margin: 0 0 4px 0;">
              Expedition Leader — Imperial Trans-Antarctic
            </p>

            <p style="color: #94A3B8; font-size: 16px; margin: 0;">
              36-Hour Nonstop Trek Across Frozen Alpine Peaks
            </p>
          </div>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_06_verified_rescue.png',
    title: 'Scene 6: Verified Stamp & Notification Popup (Lottie Badge + Notification)',
    html: `
      <div style="position: absolute; bottom: 320px; left: 60px; right: 60px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="display: flex; align-items: center; gap: 24px; background: rgba(15, 23, 42, 0.94); border: 2px solid #10B981; border-radius: 24px; padding: 28px 36px; box-shadow: 0 24px 60px rgba(0,0,0,0.9), 0 0 35px rgba(16, 185, 129, 0.3); backdrop-filter: blur(16px);">
          
          <!-- Verified Green Checkmark Stamp -->
          <div style="width: 90px; height: 90px; flex-shrink: 0; background: rgba(16, 185, 129, 0.15); border: 3px solid #10B981; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);">
            <svg viewBox="0 0 24 24" style="width: 52px; height: 52px; fill: none; stroke: #10B981; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>

          <div style="flex: 1;">
            <div style="display: inline-block; background: rgba(16, 185, 129, 0.2); border: 1px solid #10B981; border-radius: 999px; padding: 4px 14px; margin-bottom: 8px;">
              <span style="color: #34D399; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;">MISSION ACCOMPLISHED</span>
            </div>

            <h2 style="color: #FFFFFF; font-size: 34px; font-weight: 900; margin: 0 0 6px 0;">
              ALL 28 CREW MEMBERS RESCUED
            </h2>

            <p style="color: #E2E8F0; font-size: 18px; margin: 0 0 4px 0;">
              Chilean Steam Tug <span style="color: #34D399; font-weight: 700;">Yelcho</span> Returns to Elephant Island
            </p>
            <p style="color: #94A3B8; font-family: monospace; font-size: 15px; margin: 0;">
              Date: August 30, 1916 · Zero Casualties
            </p>
          </div>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_07_climax_underline.png',
    title: 'Scene 7: Cinematic Underline & Climax Card (Lottie Underline + Stat)',
    html: `
      <div style="position: absolute; bottom: 300px; left: 60px; right: 60px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: rgba(15, 23, 42, 0.94); border: 2px solid rgba(250, 204, 21, 0.5); border-radius: 28px; padding: 40px; box-shadow: 0 28px 70px rgba(0,0,0,0.9), 0 0 45px rgba(250, 204, 21, 0.3); backdrop-filter: blur(20px); text-align: center;">
          
          <p style="color: #FACC15; font-size: 18px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; margin: 0 0 8px 0;">
            THE ULTIMATE TRIUMPH
          </p>

          <h1 style="color: #FFFFFF; font-size: 46px; font-weight: 900; margin: 0 0 18px 0; letter-spacing: -0.02em;">
            20 MONTHS STRANDED
          </h1>

          <!-- Cinematic Golden Underline Rule -->
          <div style="height: 4px; width: 360px; background: linear-gradient(90deg, transparent, #FACC15, transparent); margin: 0 auto 24px auto;"></div>

          <div style="display: inline-flex; align-items: center; gap: 14px; background: rgba(16, 185, 129, 0.15); border: 2px solid #10B981; border-radius: 20px; padding: 14px 32px; box-shadow: 0 0 25px rgba(16, 185, 129, 0.3);">
            <span style="font-size: 32px;">🏆</span>
            <span style="color: #34D399; font-size: 36px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase;">
              NOT A SINGLE LIFE LOST
            </span>
          </div>

          <p style="color: #94A3B8; font-size: 18px; margin: 20px 0 0 0; font-style: italic;">
            "The Greatest Feat of Survival in Polar History"
          </p>
        </div>
      </div>
    `,
  },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

    for (let i = 0; i < overlays.length; i++) {
      const item = overlays[i];
      const targetFile = path.join(outDir, item.filename);

      const fullHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              * { box-sizing: border-box; }
              body {
                margin: 0;
                padding: 0;
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

      await page.setContent(fullHtml);
      await page.screenshot({ path: targetFile, omitBackground: true });
      console.log(`[${i + 1}/7] Rendered: ${item.filename} (${item.title})`);
    }
  } finally {
    await browser.close();
  }

  console.log('\nAll 7 overlays rendered successfully to artifacts/against_the_odds_overlays/!');
}

main().catch(console.error);
