export const CLOUD_RUN_PROD_ORIGIN =
  'https://ais-pre-gwj3ysjilq3d7v3t4xv22w-169429811401.asia-southeast1.run.app';
export const CLOUD_RUN_DEV_ORIGIN =
  'https://ais-dev-gwj3ysjilq3d7v3t4xv22w-169429811401.asia-southeast1.run.app';

export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Server-authoritative API client.
 * Calls the same-origin backend (/api/* via Express + Cloud SQL on Cloud Run
 * or /api/index serverless function on Vercel). Never uses browser-local user storage.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Remove any legacy browser-local vault keys from earlier builds
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('royalkatti_vault_users_v1');
      localStorage.removeItem('royalkatti_vault_resets_v1');
      localStorage.removeItem('royalkatti_vault_sessions_v1');
    } catch {
      // ignore storage errors
    }
  }

  return fetch(path, init);
}
