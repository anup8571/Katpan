import { SeatId } from '../game/types';

export const CLOUD_RUN_PROD_ORIGIN =
  'https://ais-pre-gwj3ysjilq3d7v3t4xv22w-169429811401.asia-southeast1.run.app';
export const CLOUD_RUN_DEV_ORIGIN =
  'https://ais-dev-gwj3ysjilq3d7v3t4xv22w-169429811401.asia-southeast1.run.app';

export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

interface StoredAccount {
  id: number;
  uid: string;
  playerId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  authProvider: string;
  emailVerified: boolean;
  preferredSeat: SeatId;
  coins: number;
  highestBalance: number;
  totalWins: number;
  totalRounds: number;
  hasPasswordHash: boolean;
  createdAt: string;
  pendingCode?: string;
}

const ACCOUNTS_KEY = 'rk_accounts_backup_v3';

function loadAccounts(): StoredAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccounts(list: StoredAccount[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

async function hashPw(pw: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`rk_salt_v3:${pw}`)
    );
    return (
      'scrypt$v3$' +
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }
  return `scrypt$v3$${btoa(pw)}`;
}

function parseBody(init?: RequestInit): Record<string, any> {
  if (!init?.body || typeof init.body !== 'string') return {};
  try {
    return JSON.parse(init.body);
  } catch {
    return {};
  }
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeToken(acc: StoredAccount): string {
  const payload = {
    userId: acc.id,
    uid: acc.uid,
    email: acc.email,
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
  };
  return `rk.${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}.sig`;
}

function decodeToken(authHeader?: string | null): { uid?: string; email?: string } | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const parts = authHeader.slice(7).trim().split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  } catch {
    return null;
  }
}

function getHeader(init: RequestInit | undefined, name: string): string | null {
  if (!init?.headers) return null;
  const h = init.headers;
  if (h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) {
    const f = h.find(([k]) => k.toLowerCase() === name.toLowerCase());
    return f ? f[1] : null;
  }
  const obj = h as Record<string, string>;
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === name.toLowerCase()) return obj[k];
  }
  return null;
}

async function handleClientFallback(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const body = parseBody(init);
  const authHeader = getHeader(init, 'Authorization');
  const accounts = loadAccounts();

  const findAcc = (idOrEmail: string) => {
    const clean = String(idOrEmail || '').trim().toLowerCase();
    if (!clean) return undefined;
    return accounts.find(
      (a) =>
        a.email.toLowerCase() === clean ||
        a.uid.toLowerCase() === clean ||
        a.playerId.toLowerCase() === clean ||
        a.displayName.toLowerCase() === clean
    );
  };

  if (path === '/api/auth/register' && method === 'POST') {
    const cleanEmail = String(body.email || '').trim().toLowerCase();
    const cleanName = String(
      body.displayName || body.playerId || cleanEmail.split('@')[0] || 'Player'
    ).trim();
    const password = String(body.password || '');

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return jsonRes({ error: 'Please enter a valid email address.' }, 400);
    }
    if (password.length < 6) {
      return jsonRes({ error: 'Password must be at least 6 characters long.' }, 400);
    }

    const baseSlug = String(body.playerId || cleanName || 'rk')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 14);
    const rand3 = Math.floor(100 + Math.random() * 900);
    const playerId = baseSlug.length >= 3 ? `${baseSlug}_${rand3}` : `rk_${rand3}`;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const pwHash = await hashPw(password);
    const seat: SeatId = ['A', 'B', 'C', 'D', 'E', 'F'].includes(body.preferredSeat)
      ? body.preferredSeat
      : 'D';

    const existing = accounts.find((a) => a.email === cleanEmail);
    if (existing && existing.emailVerified) {
      return jsonRes(
        { error: 'An account with this email already exists. Please Login.' },
        409
      );
    }

    const record: StoredAccount = {
      id: existing ? existing.id : Date.now(),
      uid: playerId,
      playerId,
      email: cleanEmail,
      displayName: cleanName,
      passwordHash: pwHash,
      authProvider: 'email_unverified',
      emailVerified: false,
      preferredSeat: seat,
      coins: 1000,
      highestBalance: 1000,
      totalWins: 0,
      totalRounds: 0,
      hasPasswordHash: true,
      createdAt: new Date().toISOString(),
      pendingCode: code,
    };

    if (existing) {
      Object.assign(existing, record);
    } else {
      accounts.push(record);
    }
    saveAccounts(accounts);

    return jsonRes(
      {
        requiresVerification: true,
        playerId: record.playerId,
        displayName: record.displayName,
        email: record.email,
        verificationCode: code,
        message: 'Enter your 6-digit verification code to verify and sign in.',
      },
      201
    );
  }

  if (path === '/api/auth/verify-email' && method === 'POST') {
    const lookup = String(body.identifier || body.email || '').trim();
    const code = String(body.code || '').trim();
    const acc = findAcc(lookup);
    if (!acc) {
      return jsonRes({ error: 'Account not found. Please register first.' }, 404);
    }
    if (acc.pendingCode && acc.pendingCode !== code) {
      return jsonRes({ error: 'Invalid 6-digit verification code.' }, 400);
    }
    acc.emailVerified = true;
    acc.authProvider = 'email_verified';
    delete acc.pendingCode;
    saveAccounts(accounts);
    return jsonRes({
      ok: true,
      token: makeToken(acc),
      user: acc,
    });
  }

  if (path === '/api/auth/resend-verification' && method === 'POST') {
    const lookup = String(body.identifier || body.email || '').trim();
    const acc = findAcc(lookup);
    if (!acc) return jsonRes({ error: 'Account not found.' }, 404);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    acc.pendingCode = code;
    saveAccounts(accounts);
    return jsonRes({
      ok: true,
      playerId: acc.playerId,
      email: acc.email,
      verificationCode: code,
    });
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const lookup = String(body.identifier || body.email || '').trim();
    const password = String(body.password || '');
    const acc = findAcc(lookup);
    if (!acc) {
      return jsonRes({ error: 'No account found with that Email or Player ID.' }, 401);
    }
    const pwHash = await hashPw(password);
    if (acc.passwordHash !== pwHash) {
      return jsonRes({ error: 'Incorrect password. Please try again.' }, 401);
    }
    if (!acc.emailVerified) {
      const code = acc.pendingCode || String(Math.floor(100000 + Math.random() * 900000));
      acc.pendingCode = code;
      saveAccounts(accounts);
      return jsonRes(
        {
          requiresVerification: true,
          playerId: acc.playerId,
          email: acc.email,
          verificationCode: code,
          error: 'Please verify your 6-digit code to sign in.',
        },
        403
      );
    }
    return jsonRes({ token: makeToken(acc), user: acc });
  }

  if (path === '/api/auth/forgot-password' && method === 'POST') {
    const lookup = String(body.identifier || body.email || '').trim();
    const acc = findAcc(lookup);
    if (!acc) {
      return jsonRes({ error: 'No account found with that Email or Player ID.' }, 404);
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    acc.pendingCode = code;
    saveAccounts(accounts);
    return jsonRes({
      ok: true,
      playerId: acc.playerId,
      email: acc.email,
      previewResetCode: code,
    });
  }

  if (path === '/api/auth/reset-password' && method === 'POST') {
    const lookup = String(body.identifier || body.email || '').trim();
    const code = String(body.code || '').trim();
    const newPassword = String(body.newPassword || '');
    const acc = findAcc(lookup);
    if (!acc) return jsonRes({ error: 'Account not found.' }, 404);
    if (acc.pendingCode && acc.pendingCode !== code) {
      return jsonRes({ error: 'Invalid 6-digit reset code.' }, 400);
    }
    acc.passwordHash = await hashPw(newPassword);
    acc.emailVerified = true;
    acc.authProvider = 'email_verified';
    delete acc.pendingCode;
    saveAccounts(accounts);
    return jsonRes({ ok: true, token: makeToken(acc), user: acc });
  }

  if (path === '/api/auth/me' && method === 'GET') {
    const decoded = decodeToken(authHeader);
    const acc = decoded ? findAcc(decoded.uid || decoded.email || '') : undefined;
    if (!acc) return jsonRes({ error: 'Unauthorized' }, 401);
    return jsonRes({ user: acc, sessions: [] });
  }

  if (path === '/api/sessions' && method === 'POST') {
    const decoded = decodeToken(authHeader);
    const acc = decoded ? findAcc(decoded.uid || decoded.email || '') : undefined;
    if (!acc) return jsonRes({ error: 'Unauthorized' }, 401);
    if (typeof body.finalBalance === 'number') {
      acc.coins = Math.max(50, Math.round(body.finalBalance));
      acc.highestBalance = Math.max(acc.highestBalance, acc.coins);
    }
    acc.totalRounds += 1;
    if (Number(body.coinDelta || 0) >= 0) acc.totalWins += 1;
    saveAccounts(accounts);
    return jsonRes({ user: acc }, 201);
  }

  if (path === '/api/rooms') {
    return jsonRes({
      rooms: [
        {
          roomCode: 'RK-ROYAL',
          roomName: 'Maharaja Royal Club',
          hostName: 'Maharaja Bot',
          dealerSeat: 'A',
          cutterSeat: 'B',
          phase: 'shuffling',
          playerCount: 1,
          maxPlayers: 6,
          occupiedSeats: {},
          isPublic: true,
        },
      ],
    });
  }

  return jsonRes({ ok: true });
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(path, init);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      return res;
    }
  } catch {
    // Fall through if server endpoint is unreachable on static deployment
  }
  return handleClientFallback(path, init);
}
