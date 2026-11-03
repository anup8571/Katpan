import fs from 'node:fs';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SCRYPT_KEYLEN = 64;
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'royal-katti-cloudsql-rls-secret-2026';
const TMP_DB_PATH = '/tmp/royalkatti_serverless_db_v3.json';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, saltHex, keyHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const storedKey = Buffer.from(keyHex, 'hex');
    if (storedKey.length !== SCRYPT_KEYLEN) return false;
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    return crypto.timingSafeEqual(storedKey, derivedKey);
  } catch {
    return false;
  }
}

function hashResetCode(code: string): string {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(code.trim()).digest('hex');
}

function generateResetCode(): { code: string; tokenHash: string; expiresAt: Date } {
  const code = String(crypto.randomInt(100000, 999999));
  const tokenHash = hashResetCode(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  return { code, tokenHash, expiresAt };
}

function signPayload(payload: Record<string, any>, ttlSeconds = 86400 * 7): string {
  const full = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyPayload<T = Record<string, any>>(token: string): T | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  try {
    const expectedSig = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(data)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded as T;
  } catch {
    return null;
  }
}

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

declare global {
  var _rkServerStoreV3: ServerStore | undefined;
}

function loadServerStore(): ServerStore {
  if (global._rkServerStoreV3) return global._rkServerStoreV3;
  try {
    if (fs.existsSync(TMP_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(TMP_DB_PATH, 'utf8'));
      global._rkServerStoreV3 = parsed;
      return parsed;
    }
  } catch {
    // ignore
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
  global._rkServerStoreV3 = initial;
  return initial;
}

function saveServerStore(store: ServerStore) {
  global._rkServerStoreV3 = store;
  try {
    fs.writeFileSync(TMP_DB_PATH, JSON.stringify(store), 'utf8');
  } catch {
    // ignore
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
    hasPasswordHash: true,
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
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
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
  if (method === 'OPTIONS') return sendJson(res, 204, {});

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname;
  const body = await readJsonBody(req);
  const store = loadServerStore();

  // 1. Register
  if (pathname === '/api/auth/register' && method === 'POST') {
    const { playerId, email, password, displayName, preferredSeat } = body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(
      displayName || playerId || cleanEmail.split('@')[0] || 'Royal Player'
    ).trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return sendJson(res, 400, { error: 'Please enter a valid email address.' });
    }
    if (!password || String(password).length < 6) {
      return sendJson(res, 400, { error: 'Password must be at least 6 characters long.' });
    }

    const baseSlug = String(playerId || displayName || cleanEmail.split('@')[0] || 'rk')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 14);
    let candidateId =
      baseSlug.length >= 3
        ? `${baseSlug}_${crypto.randomInt(100, 999)}`
        : `rk_${crypto.randomInt(1000, 9999)}`;

    const explicitSlug = String(playerId || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '');
    if (explicitSlug.length >= 3) {
      candidateId = explicitSlug;
    }

    if (store.users.some((u) => u.uid === candidateId && u.email !== cleanEmail)) {
      candidateId = `${baseSlug || 'rk'}_${crypto.randomInt(1000, 9999)}`;
    }

    const passwordHash = hashPassword(String(password));
    const seat = ['A', 'B', 'C', 'D', 'E', 'F'].includes(preferredSeat) ? preferredSeat : 'D';

    let targetUser = store.users.find((u) => u.email === cleanEmail);
    if (targetUser && targetUser.emailVerified) {
      return sendJson(res, 409, {
        error: 'An account with this email already exists. Please Login or use Forgot Password.',
      });
    }

    if (!targetUser) {
      targetUser = {
        id: Date.now(),
        uid: candidateId,
        playerId: candidateId,
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
    } else {
      targetUser.uid = candidateId;
      targetUser.playerId = candidateId;
      targetUser.displayName = cleanName;
      targetUser.passwordHash = passwordHash;
      targetUser.preferredSeat = seat;
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

    // Stateless signed verification token so cold-start serverless instances can also verify
    const verificationToken = signPayload(
      {
        user: targetUser,
        tokenHash,
      },
      900
    );

    return sendJson(res, 201, {
      requiresVerification: true,
      playerId: targetUser.uid,
      displayName: targetUser.displayName,
      email: targetUser.email,
      verificationCode: code,
      verificationToken,
      expiresAt: expiresAt.toISOString(),
      message: 'Enter your 6-digit verification code to verify and sign in.',
    });
  }

  // 2. Verify Email
  if (pathname === '/api/auth/verify-email' && method === 'POST') {
    const { identifier, email, code, verificationToken } = body;
    const lookup = String(identifier || email || '').trim();
    const cleanCode = String(code || '').trim();

    if (!cleanCode) {
      return sendJson(res, 400, { error: 'Please enter the 6-digit verification code.' });
    }

    const expectedHash = hashResetCode(cleanCode);
    let user = findUser(store, lookup);

    // Recover user from stateless signed verificationToken if serverless cold-started
    if (verificationToken) {
      const decoded = verifyPayload<{ user: ServerUserRecord; tokenHash: string }>(
        verificationToken
      );
      if (decoded && decoded.tokenHash === expectedHash && decoded.user) {
        if (!user) {
          user = {
            ...decoded.user,
            authProvider: 'email_verified',
            emailVerified: true,
          };
          store.users.push(user);
        } else {
          user.authProvider = 'email_verified';
          user.emailVerified = true;
        }
        saveServerStore(store);
        const token = signPayload({
          userId: user.id,
          uid: user.uid,
          email: user.email,
          userSnapshot: sanitizeServerUser(user),
        });
        return sendJson(res, 200, {
          ok: true,
          token,
          user: sanitizeServerUser(user),
        });
      }
    }

    if (!user) {
      return sendJson(res, 404, { error: 'Account not found. Please register again.' });
    }

    const now = Date.now();
    const match = store.tokens.find(
      (t) =>
        t.userId === user!.id &&
        t.tokenHash === expectedHash &&
        !t.usedAt &&
        new Date(t.expiresAt).getTime() > now
    );

    if (!match) {
      return sendJson(res, 400, {
        error: 'Invalid or expired 6-digit verification code.',
      });
    }

    match.usedAt = new Date().toISOString();
    user.authProvider = 'email_verified';
    user.emailVerified = true;
    saveServerStore(store);

    const token = signPayload({
      userId: user.id,
      uid: user.uid,
      email: user.email,
      userSnapshot: sanitizeServerUser(user),
    });

    return sendJson(res, 200, {
      ok: true,
      token,
      user: sanitizeServerUser(user),
    });
  }

  // 3. Resend Verification Code
  if (pathname === '/api/auth/resend-verification' && method === 'POST') {
    const { identifier, email } = body;
    const lookup = String(identifier || email || '').trim();
    const user = findUser(store, lookup);
    if (!user) {
      return sendJson(res, 404, { error: 'Account not found.' });
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
    const verificationToken = signPayload({ user, tokenHash }, 900);
    return sendJson(res, 200, {
      ok: true,
      playerId: user.uid,
      email: user.email,
      verificationCode: code,
      verificationToken,
      message: 'New 6-digit verification code generated.',
    });
  }

  // 4. Login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { identifier, email, password } = body;
    const lookup = String(identifier || email || '').trim();
    if (!lookup || !password) {
      return sendJson(res, 400, { error: 'Please enter your Email/Player ID and password.' });
    }
    const user = findUser(store, lookup);
    if (!user) {
      return sendJson(res, 401, {
        error: 'Account not found. Please Register first.',
      });
    }
    if (!verifyPassword(String(password), user.passwordHash)) {
      return sendJson(res, 401, { error: 'Invalid Email/Player ID or password.' });
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
      const verificationToken = signPayload({ user, tokenHash }, 900);
      return sendJson(res, 403, {
        requiresVerification: true,
        playerId: user.uid,
        email: user.email,
        verificationCode: code,
        verificationToken,
        error: 'Please verify your 6-digit code to finish activating your account.',
      });
    }
    const token = signPayload({
      userId: user.id,
      uid: user.uid,
      email: user.email,
      userSnapshot: sanitizeServerUser(user),
    });
    return sendJson(res, 200, { token, user: sanitizeServerUser(user) });
  }

  // 5. Forgot Password
  if (pathname === '/api/auth/forgot-password' && method === 'POST') {
    const { identifier, email } = body;
    const lookup = String(identifier || email || '').trim();
    const user = findUser(store, lookup);
    if (!user) {
      return sendJson(res, 404, { error: 'No account found with that Email or Player ID.' });
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
    const resetToken = signPayload({ user, tokenHash }, 900);
    return sendJson(res, 200, {
      ok: true,
      playerId: user.uid,
      email: user.email,
      previewResetCode: code,
      resetToken,
    });
  }

  // 6. Reset Password
  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    const { identifier, email, code, newPassword, resetToken } = body;
    const lookup = String(identifier || email || '').trim();
    const cleanCode = String(code || '').trim();
    if (!cleanCode || !newPassword || String(newPassword).length < 6) {
      return sendJson(res, 400, {
        error: 'Valid 6-digit code and a new password (min 6 characters) are required.',
      });
    }

    const expectedHash = hashResetCode(cleanCode);
    let user = findUser(store, lookup);

    if (resetToken) {
      const decoded = verifyPayload<{ user: ServerUserRecord; tokenHash: string }>(resetToken);
      if (decoded && decoded.tokenHash === expectedHash && decoded.user) {
        const newHash = hashPassword(String(newPassword));
        if (!user) {
          user = {
            ...decoded.user,
            passwordHash: newHash,
            authProvider: 'email_verified',
            emailVerified: true,
          };
          store.users.push(user);
        } else {
          user.passwordHash = newHash;
          user.authProvider = 'email_verified';
          user.emailVerified = true;
        }
        saveServerStore(store);
        const token = signPayload({
          userId: user.id,
          uid: user.uid,
          email: user.email,
          userSnapshot: sanitizeServerUser(user),
        });
        return sendJson(res, 200, { ok: true, token, user: sanitizeServerUser(user) });
      }
    }

    if (!user) {
      return sendJson(res, 404, { error: 'Account not found.' });
    }
    const now = Date.now();
    const match = store.tokens.find(
      (t) =>
        t.userId === user!.id &&
        t.tokenHash === expectedHash &&
        !t.usedAt &&
        new Date(t.expiresAt).getTime() > now
    );
    if (!match) {
      return sendJson(res, 400, { error: 'Invalid or expired 6-digit reset code.' });
    }
    match.usedAt = new Date().toISOString();
    user.passwordHash = hashPassword(String(newPassword));
    user.authProvider = 'email_verified';
    user.emailVerified = true;
    saveServerStore(store);

    const token = signPayload({
      userId: user.id,
      uid: user.uid,
      email: user.email,
      userSnapshot: sanitizeServerUser(user),
    });
    return sendJson(res, 200, { ok: true, token, user: sanitizeServerUser(user) });
  }

  // 7. Me
  if (pathname === '/api/auth/me' && method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = verifyPayload<any>(token);
    if (!session) return sendJson(res, 401, { error: 'Unauthorized' });
    const user =
      findUser(store, session.uid) ||
      findUser(store, session.email) ||
      session.userSnapshot;
    if (!user) return sendJson(res, 404, { error: 'User not found' });
    return sendJson(res, 200, {
      user: user.id ? sanitizeServerUser(user) : user,
      sessions: store.sessions.filter((s) => s.userId === user.id).slice(0, 10),
    });
  }

  // 8. Sessions & Rooms
  if (pathname === '/api/sessions' && method === 'POST') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = verifyPayload<any>(token);
    if (!session) return sendJson(res, 401, { error: 'Unauthorized' });
    const user = findUser(store, session.uid) || findUser(store, session.email);
    if (user) {
      const nextCoins =
        typeof body.finalBalance === 'number'
          ? Math.max(50, Math.round(body.finalBalance))
          : user.coins;
      const delta = Number(body.coinDelta || 0);
      user.coins = nextCoins;
      user.highestBalance = Math.max(user.highestBalance, nextCoins);
      user.totalRounds += 1;
      if (delta >= 0) user.totalWins += 1;
      saveServerStore(store);
      return sendJson(res, 201, { user: sanitizeServerUser(user) });
    }
    return sendJson(res, 201, { user: session.userSnapshot || null });
  }

  if (pathname === '/api/rooms') {
    if (method === 'GET') return sendJson(res, 200, { rooms: store.rooms });
    if (method === 'POST') {
      const code = `RK-${crypto.randomInt(1000, 9999)}`;
      const hostName = String(body.hostName || 'Player').trim();
      const roomName = String(body.roomName || `${hostName}'s Table`).trim();
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
