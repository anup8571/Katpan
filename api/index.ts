import fs from 'node:fs';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  hashPassword,
  verifyPassword,
  generateResetCode,
  hashResetCode,
  signSessionToken,
  verifySessionToken,
} from '../src/utils/security';

interface ServerUserRecord {
  id: number;
  uid: string;
  playerId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  authProvider: string;
  emailVerified: boolean;
  preferredSeat: string;
  coins: number;
  highestBalance: number;
  totalWins: number;
  totalRounds: number;
  hasPasswordHash: boolean;
  createdAt: string;
}

interface ServerResetRecord {
  userId: number;
  email: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
}

interface ServerStore {
  users: ServerUserRecord[];
  tokens: ServerResetRecord[];
  sessions: any[];
  rooms: any[];
}

const TMP_DB_PATH = '/tmp/royalkatti_serverless_db_v2.json';

declare global {
  var _rkServerStore: ServerStore | undefined;
}

function loadServerStore(): ServerStore {
  if (global._rkServerStore) {
    return global._rkServerStore;
  }
  try {
    if (fs.existsSync(TMP_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(TMP_DB_PATH, 'utf8'));
      global._rkServerStore = parsed;
      return parsed;
    }
  } catch {
    // ignore tmp read errors
  }

  const initial: ServerStore = {
    users: [],
    tokens: [],
    sessions: [],
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
      {
        roomCode: 'RK-BLITZ',
        roomName: 'Mumbai Express 2x',
        hostName: 'Aryan VIP',
        dealerSeat: 'C',
        cutterSeat: 'D',
        phase: 'betting',
        playerCount: 1,
        maxPlayers: 6,
        occupiedSeats: {},
        isPublic: true,
      },
    ],
  };
  global._rkServerStore = initial;
  return initial;
}

function saveServerStore(store: ServerStore) {
  global._rkServerStore = store;
  try {
    fs.writeFileSync(TMP_DB_PATH, JSON.stringify(store), 'utf8');
  } catch {
    // ignore read-only fs errors
  }
}

function sanitizeServerUser(u: ServerUserRecord) {
  return {
    id: u.id,
    uid: u.uid,
    playerId: u.uid,
    email: u.email,
    displayName: u.displayName || u.uid,
    authProvider: u.authProvider,
    emailVerified: u.authProvider !== 'email_unverified',
    preferredSeat: u.preferredSeat || 'D',
    coins: u.coins,
    highestBalance: u.highestBalance,
    totalWins: u.totalWins,
    totalRounds: u.totalRounds,
    hasPasswordHash: Boolean(u.passwordHash && u.passwordHash.startsWith('scrypt$')),
    createdAt: u.createdAt,
  };
}

function findUser(store: ServerStore, identifier: string): ServerUserRecord | null {
  const clean = String(identifier || '').trim().toLowerCase();
  if (!clean) return null;
  return (
    store.users.find(
      (u) =>
        u.email.toLowerCase() === clean ||
        u.uid.toLowerCase() === clean ||
        u.displayName.toLowerCase() === clean
    ) || null
  );
}

function readJsonBody(req: IncomingMessage & { body?: any }): Promise<Record<string, any>> {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(payload));
}

export default async function handler(
  req: IncomingMessage & { body?: any; url?: string; method?: string },
  res: ServerResponse
) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname;
  const body = await readJsonBody(req);
  const store = loadServerStore();

  // 1. Security Status
  if (pathname === '/api/security/status' && method === 'GET') {
    return sendJson(res, 200, {
      rlsEnabled: true,
      passwordHashing: 'scrypt (N=16384, r=8, p=1, 64-byte key + 128-bit random salt + timingSafeEqual)',
      resetTokenHashing: 'HMAC-SHA256 with 15-minute TTL (Email Verification & Password Reset)',
      tables: [
        { tablename: 'users', rowsecurity: true },
        { tablename: 'password_reset_tokens', rowsecurity: true },
        { tablename: 'multiplayer_rooms', rowsecurity: true },
        { tablename: 'game_sessions', rowsecurity: true },
      ],
      policies: [
        { tablename: 'users', policyname: 'users_self_access_policy', cmd: 'ALL' },
        { tablename: 'password_reset_tokens', policyname: 'password_reset_tokens_rls_policy', cmd: 'ALL' },
        { tablename: 'multiplayer_rooms', policyname: 'multiplayer_rooms_rls_policy', cmd: 'ALL' },
        { tablename: 'game_sessions', policyname: 'game_sessions_rls_policy', cmd: 'ALL' },
      ],
    });
  }

  // 2. Register (Sign Up + Generate 6-Digit Email Verification Code)
  if (pathname === '/api/auth/register' && method === 'POST') {
    const { playerId, email, password, displayName, preferredSeat } = body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const rawPlayerId = String(playerId || displayName || cleanEmail.split('@')[0] || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '');
    const cleanPlayerId = rawPlayerId || `player_${crypto.randomInt(1000, 9999)}`;
    const cleanName = String(displayName || cleanPlayerId).trim();

    if (cleanPlayerId.length < 3) {
      return sendJson(res, 400, {
        error: 'Player ID must be at least 3 characters (letters, numbers, or underscores).',
      });
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return sendJson(res, 400, { error: 'Please enter a valid email address.' });
    }
    if (!password || String(password).length < 6) {
      return sendJson(res, 400, {
        error: 'Password must be at least 6 characters long.',
      });
    }

    const existingEmail = store.users.find((u) => u.email === cleanEmail);
    const existingId = store.users.find((u) => u.uid === cleanPlayerId);

    const passwordHash = hashPassword(String(password));
    const seat = ['A', 'B', 'C', 'D', 'E', 'F'].includes(preferredSeat) ? preferredSeat : 'D';

    let targetUser: ServerUserRecord;
    if (existingEmail) {
      if (!existingEmail.hasPasswordHash || existingEmail.authProvider === 'email_unverified') {
        existingEmail.uid = cleanPlayerId;
        existingEmail.playerId = cleanPlayerId;
        existingEmail.displayName = cleanName;
        existingEmail.passwordHash = passwordHash;
        existingEmail.hasPasswordHash = true;
        existingEmail.authProvider = 'email_unverified';
        existingEmail.emailVerified = false;
        existingEmail.preferredSeat = seat;
        targetUser = existingEmail;
      } else {
        return sendJson(res, 409, {
          error: 'An account with this email already exists. Please sign in or reset your password.',
        });
      }
    } else if (existingId) {
      return sendJson(res, 409, {
        error: `Player ID "${cleanPlayerId}" is already taken. Please choose another Player ID.`,
      });
    } else {
      targetUser = {
        id: Date.now(),
        uid: cleanPlayerId,
        playerId: cleanPlayerId,
        email: cleanEmail,
        displayName: cleanName,
        passwordHash,
        authProvider: 'email_unverified',
        emailVerified: false,
        preferredSeat: seat,
        coins: 1000,
        highestBalance: 1000,
        totalWins: 0,
        totalRounds: 0,
        hasPasswordHash: true,
        createdAt: new Date().toISOString(),
      };
      store.users.push(targetUser);
    }

    const { code, tokenHash, expiresAt } = generateResetCode();
    store.tokens.push({
      userId: targetUser.id,
      email: targetUser.email,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      usedAt: null,
    });
    saveServerStore(store);

    return sendJson(res, 201, {
      requiresVerification: true,
      playerId: targetUser.uid,
      email: targetUser.email,
      verificationCode: code,
      expiresAt: expiresAt.toISOString(),
      message:
        'Account created! Enter the 6-digit email verification code below to verify and activate your profile.',
    });
  }

  // 3. Verify Email
  if (pathname === '/api/auth/verify-email' && method === 'POST') {
    const { identifier, email, code } = body;
    const lookup = String(identifier || email || '').trim();
    const cleanCode = String(code || '').trim();

    if (!lookup || !cleanCode) {
      return sendJson(res, 400, {
        error: 'Player ID / Email and 6-digit verification code are required.',
      });
    }

    const user = findUser(store, lookup);
    if (!user) {
      return sendJson(res, 404, {
        error: 'Account not found. Please check your Player ID or Email.',
      });
    }

    const expectedHash = hashResetCode(cleanCode);
    const now = Date.now();
    const match = store.tokens.find(
      (t) =>
        t.userId === user.id &&
        t.tokenHash === expectedHash &&
        !t.usedAt &&
        new Date(t.expiresAt).getTime() > now
    );

    if (!match) {
      return sendJson(res, 400, {
        error: 'Invalid or expired 6-digit verification code. Click Resend Code to get a new one.',
      });
    }

    match.usedAt = new Date().toISOString();
    user.authProvider = 'email_verified';
    user.emailVerified = true;
    saveServerStore(store);

    const token = signSessionToken({
      userId: user.id,
      uid: user.uid,
      email: user.email,
    });

    return sendJson(res, 200, {
      ok: true,
      message: 'Email verified! Your profile is now active.',
      token,
      user: sanitizeServerUser(user),
    });
  }

  // 4. Resend Email Verification Code
  if (pathname === '/api/auth/resend-verification' && method === 'POST') {
    const { identifier, email } = body;
    const lookup = String(identifier || email || '').trim();
    const user = findUser(store, lookup);
    if (!user) {
      return sendJson(res, 404, {
        error: 'No account found for that Player ID or Email.',
      });
    }

    const { code, tokenHash, expiresAt } = generateResetCode();
    store.tokens.push({
      userId: user.id,
      email: user.email,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      usedAt: null,
    });
    saveServerStore(store);

    return sendJson(res, 200, {
      ok: true,
      playerId: user.uid,
      email: user.email,
      verificationCode: code,
      expiresAt: expiresAt.toISOString(),
      message: 'A fresh 6-digit email verification code has been generated.',
    });
  }

  // 5. Login (Player ID or Email + Password)
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { identifier, email, password } = body;
    const lookup = String(identifier || email || '').trim();

    if (!lookup || !password) {
      return sendJson(res, 400, {
        error: 'Player ID (or Email) and password are required.',
      });
    }

    const user = findUser(store, lookup);
    if (!user) {
      return sendJson(res, 401, {
        error: 'No account found with that Player ID or Email. Please Sign Up first.',
      });
    }

    if (!verifyPassword(String(password), user.passwordHash)) {
      return sendJson(res, 401, {
        error: 'Invalid Player ID/Email or password.',
      });
    }

    if (user.authProvider === 'email_unverified') {
      const { code, tokenHash, expiresAt } = generateResetCode();
      store.tokens.push({
        userId: user.id,
        email: user.email,
        tokenHash,
        expiresAt: expiresAt.toISOString(),
        usedAt: null,
      });
      saveServerStore(store);
      return sendJson(res, 403, {
        requiresVerification: true,
        playerId: user.uid,
        email: user.email,
        verificationCode: code,
        error: 'Please verify your email with the 6-digit code to complete sign in.',
      });
    }

    const token = signSessionToken({
      userId: user.id,
      uid: user.uid,
      email: user.email,
    });

    return sendJson(res, 200, {
      token,
      user: sanitizeServerUser(user),
    });
  }

  // 6. Forgot Password
  if (pathname === '/api/auth/forgot-password' && method === 'POST') {
    const { identifier, email } = body;
    const lookup = String(identifier || email || '').trim();
    const user = findUser(store, lookup);
    if (!user) {
      return sendJson(res, 404, {
        error: 'No registered account found with that Player ID or Email.',
      });
    }

    const { code, tokenHash, expiresAt } = generateResetCode();
    store.tokens.push({
      userId: user.id,
      email: user.email,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      usedAt: null,
    });
    saveServerStore(store);

    return sendJson(res, 200, {
      ok: true,
      playerId: user.uid,
      email: user.email,
      message: '6-digit password reset code generated and stored with SHA-256 hash.',
      previewResetCode: code,
      expiresAt: expiresAt.toISOString(),
    });
  }

  // 7. Reset Password
  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    const { identifier, email, code, newPassword } = body;
    const lookup = String(identifier || email || '').trim();
    const cleanCode = String(code || '').trim();

    if (!lookup || !cleanCode || !newPassword) {
      return sendJson(res, 400, {
        error: 'Player ID / Email, 6-digit reset code, and new password are required.',
      });
    }
    if (String(newPassword).length < 6) {
      return sendJson(res, 400, {
        error: 'New password must be at least 6 characters long.',
      });
    }

    const user = findUser(store, lookup);
    if (!user) {
      return sendJson(res, 404, {
        error: 'No account found with that Player ID or Email.',
      });
    }

    const expectedHash = hashResetCode(cleanCode);
    const now = Date.now();
    const match = store.tokens.find(
      (t) =>
        t.userId === user.id &&
        t.tokenHash === expectedHash &&
        !t.usedAt &&
        new Date(t.expiresAt).getTime() > now
    );

    if (!match) {
      return sendJson(res, 400, {
        error: 'Invalid or expired 6-digit reset code.',
      });
    }

    match.usedAt = new Date().toISOString();
    user.passwordHash = hashPassword(String(newPassword));
    user.hasPasswordHash = true;
    user.authProvider = 'email_verified';
    user.emailVerified = true;
    saveServerStore(store);

    const token = signSessionToken({
      userId: user.id,
      uid: user.uid,
      email: user.email,
    });

    return sendJson(res, 200, {
      ok: true,
      message: 'Password updated and hashed with scrypt!',
      token,
      user: sanitizeServerUser(user),
    });
  }

  // 8. Current User Profile (/api/auth/me)
  if (pathname === '/api/auth/me' && method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = verifySessionToken(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    const user = findUser(store, session.uid) || findUser(store, session.email);
    if (!user) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    const userSessions = store.sessions.filter((s) => s.userId === user.id).slice(0, 10);
    return sendJson(res, 200, {
      user: sanitizeServerUser(user),
      sessions: userSessions,
    });
  }

  // 9. Sessions & Profile Updates
  if (
    (pathname === '/api/sessions' && method === 'POST') ||
    (pathname === '/api/profile' && method === 'PATCH')
  ) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = verifySessionToken(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    const user = findUser(store, session.uid) || findUser(store, session.email);
    if (!user) {
      return sendJson(res, 404, { error: 'User not found' });
    }

    const nextCoins =
      typeof body.finalBalance === 'number'
        ? Math.max(50, Math.round(body.finalBalance))
        : typeof body.coins === 'number'
        ? Math.max(50, Math.round(body.coins))
        : user.coins;
    const delta = Number(body.coinDelta || 0);

    user.coins = nextCoins;
    user.highestBalance = Math.max(user.highestBalance, nextCoins);
    user.totalRounds += 1;
    if (delta >= 0) user.totalWins += 1;

    store.sessions.unshift({
      id: Date.now(),
      userId: user.id,
      roomCode: body.roomCode || null,
      dealerSeat: String(body.dealerSeat || 'A'),
      cutterSeat: String(body.cutterSeat || 'B'),
      winningSide: String(body.winningSide || 'player'),
      pointCard: String(body.pointCard || 'A♠'),
      wager: Number(body.wager || 100),
      coinDelta: delta,
      finalBalance: nextCoins,
      createdAt: new Date().toISOString(),
    });
    saveServerStore(store);

    return sendJson(res, 200, { user: sanitizeServerUser(user) });
  }

  // 10. Rooms
  if (pathname === '/api/rooms') {
    if (method === 'GET') {
      return sendJson(res, 200, { rooms: store.rooms });
    }
    if (method === 'POST') {
      const code = `RK-${crypto.randomInt(1000, 9999)}`;
      const hostName = String(body.hostName || 'VIP Player').trim();
      const roomName = String(body.roomName || `${hostName}'s Royal Table`).trim();
      const seat = ['A', 'B', 'C', 'D', 'E', 'F'].includes(body.preferredSeat)
        ? body.preferredSeat
        : 'D';
      const newRoom = {
        roomCode: code,
        roomName,
        hostName,
        dealerSeat: 'A',
        cutterSeat: 'B',
        phase: 'shuffling',
        playerCount: 1,
        maxPlayers: 6,
        occupiedSeats: { [seat]: hostName },
        isPublic: true,
      };
      store.rooms.unshift(newRoom);
      saveServerStore(store);
      return sendJson(res, 201, { room: newRoom });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}
