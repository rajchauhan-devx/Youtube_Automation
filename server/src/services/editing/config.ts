import fs from 'node:fs';
export function numberSetting(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}
export function editingConfig() {
  const envBrowser = process.env.EDITING_BROWSER_EXECUTABLE;
  return {
    maxCalls: numberSetting('EDITING_MAX_PROVIDER_CALLS', 40, 1, 2000),
    providerTimeout: numberSetting('EDITING_PROVIDER_TIMEOUT_MS', 120000, 1000, 600000),
    renderTimeout: numberSetting('EDITING_RENDER_TIMEOUT_MS', 1800000, 1000, 7200000),
    renderConcurrency: numberSetting('EDITING_RENDER_CONCURRENCY', 1, 1, 4),
    browser: [
      envBrowser && fs.existsSync(envBrowser) ? envBrowser : '',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/usr/bin/google-chrome', '/usr/bin/chromium',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ].find(p => Boolean(p) && fs.existsSync(p)),
  };
}
export class EditingError extends Error {
  constructor(public code: string, message: string, public status = 422, public retryable = false) { super(message); }
}
