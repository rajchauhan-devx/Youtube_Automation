import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AdcCredentials {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  type?: string;
  quota_project_id?: string;
}

let cachedToken: { token: string; expiresAt: number; projectId: string } | null = null;

export function getAdcFilePath(): string {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'gcloud', 'application_default_credentials.json');
}

export function isAdcConfigured(): boolean {
  try {
    const p = getAdcFilePath();
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export async function getGoogleAuthToken(): Promise<{ token: string; projectId: string } | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return { token: cachedToken.token, projectId: cachedToken.projectId };
  }

  const adcPath = getAdcFilePath();
  if (!fs.existsSync(adcPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(adcPath, 'utf8');
    const parsed: AdcCredentials = JSON.parse(raw);
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      parsed.quota_project_id ||
      '';

    if (parsed.refresh_token && parsed.client_id && parsed.client_secret) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: parsed.client_id,
          client_secret: parsed.client_secret,
          refresh_token: parsed.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (tokenRes.ok) {
        const data = (await tokenRes.json()) as any;
        if (data.access_token) {
          cachedToken = {
            token: data.access_token,
            expiresAt: now + (data.expires_in || 3600) * 1000,
            projectId,
          };
          return { token: data.access_token, projectId };
        }
      }
    }

    // Fallback: try calling gcloud CLI if installed
    const candidates = [
      'gcloud',
      path.join(os.homedir(), 'google-cloud-sdk', 'bin', 'gcloud'),
    ];
    for (const bin of candidates) {
      try {
        const { stdout } = await execFileAsync(bin, ['auth', 'application-default', 'print-access-token']);
        const token = stdout.trim();
        if (token) {
          cachedToken = {
            token,
            expiresAt: now + 3000 * 1000,
            projectId,
          };
          return { token, projectId };
        }
      } catch {
        // Continue to next candidate
      }
    }
  } catch (err: any) {
    console.warn('[ADC] Failed to retrieve access token:', err.message);
  }

  return null;
}
