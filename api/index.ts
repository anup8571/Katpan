import fs from 'node:fs';
import crypto from 'node:crypto';
import tls from 'node:tls';
import net from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SCRYPT_KEYLEN = 64;
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'royal-katti-cloudsql-rls-secret-2026';
const TMP_DB_PATH = '/tmp/royalkatti_serverless_db_v3.json';
const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_API_KEY || 'AIzaSyCP9aCqJt8vJAcF0Oss00iJswZb8x0FPcI';

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

async function verifyFirebaseIdTokenEmail(idToken: string): Promise<string | null> {
  if (!idToken || !FIREBASE_WEB_API_KEY) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ email?: string; emailVerified?: boolean }>;
    };
    const fbUser = data?.users?.[0];
    if (fbUser && fbUser.email && fbUser.emailVerified) {
      return fbUser.email.trim().toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

function buildHtmlEmail(params: {
  title: string;
  subtitle: string;
  playerId: string;
  code: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #090d16; color: #f8fafc; border-radius: 16px; padding: 28px; border: 1px solid rgba(251, 191, 36, 0.25);">
      <h2 style="margin: 0 0 8px; color: #fbbf24; font-size: 20px;">${params.title}</h2>
      <p style="margin: 0 0 20px; color: #cbd5e1; font-size: 14px; line-height: 1.5;">${params.subtitle}</p>
      <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">Your Player ID</div>
        <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: #fcd34d; margin-bottom: 14px;">${params.playerId}</div>
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">6-Digit Security Code</div>
        <div style="font-family: monospace; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #34d399;">${params.code}</div>
      </div>
      <p style="margin: 0; color: #64748b; font-size: 12px;">This code expires in 15 minutes. Never share this code with anyone.</p>
    </div>
  `;
}

async function sendViaSmtp(params: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const isImplicitTls = params.port === 465;
    const socket: net.Socket | tls.TLSSocket = isImplicitTls
      ? tls.connect({ host: params.host, port: params.port, servername: params.host })
      : net.createConnection({ host: params.host, port: params.port });

    let activeSocket: net.Socket | tls.TLSSocket = socket;
    let step = 0;
    let resolved = false;

    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      try {
        activeSocket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };

    const timeout = setTimeout(() => finish(false), 8000);
    const sendLine = (line: string) => activeSocket.write(line + '\r\n');

    const onData = (buf: Buffer) => {
      const text = buf.toString('utf8');
      const code = parseInt(text.slice(0, 3), 10);
      const lines = text.trim().split('\r\n');
      const lastLine = lines[lines.length - 1] || '';
      if (lastLine.length >= 4 && lastLine[3] === '-') return;

      if (step === 0 && code === 220) {
        step = isImplicitTls ? 2 : 1;
        sendLine('EHLO royalkatti.app');
      } else if (step === 1 && code === 250) {
        step = 15;
        sendLine('STARTTLS');
      } else if (step === 15 && code === 220) {
        activeSocket.removeAllListeners('data');
        const tlsSock = tls.connect({ socket: activeSocket, servername: params.host });
        activeSocket = tlsSock;
        tlsSock.on('data', onData);
        tlsSock.on('error', () => {
          clearTimeout(timeout);
          finish(false);
        });
        step = 2;
        sendLine('EHLO royalkatti.app');
      } else if (step === 2 && code === 250) {
        step = 3;
        sendLine('AUTH LOGIN');
      } else if (step === 3 && code === 334) {
        step = 4;
        sendLine(Buffer.from(params.user, 'utf8').toString('base64'));
      } else if (step === 4 && code === 334) {
        step = 5;
        sendLine(Buffer.from(params.pass, 'utf8').toString('base64'));
      } else if (step === 5 && code === 235) {
        step = 6;
        sendLine(`MAIL FROM:<${params.from}>`);
      } else if (step === 6 && code === 250) {
        step = 7;
        sendLine(`RCPT TO:<${params.to}>`);
      } else if (step === 7 && (code === 250 || code === 251)) {
        step = 8;
        sendLine('DATA');
      } else if (step === 8 && code === 354) {
        step = 9;
        const message = [
          `From: "Royal Katti VIP" <${params.from}>`,
          `To: <${params.to}>`,
          `Subject: ${params.subject}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/html; charset=utf-8`,
          ``,
          params.html,
          `.`,
        ].join('\r\n');
        sendLine(message);
      } else if (step === 9 && code === 250) {
        step = 10;
        sendLine('QUIT');
        clearTimeout(timeout);
        finish(true);
      } else if (code >= 400) {
        clearTimeout(timeout);
        finish(false);
      }
    };

    activeSocket.on('data', onData);
    activeSocket.on('error', () => {
      clearTimeout(timeout);
      finish(false);
    });
  });
}

async function dispatchCodeEmail(params: {
  to: string;
  playerId: string;
  code: string;
  purpose: 'verify' | 'reset';
}): Promise<{ sent: boolean; provider: string }> {
  const subject =
    params.purpose === 'verify'
      ? `${params.code} is your Royal Katti verification code`
      : `${params.code} is your Royal Katti password reset code`;

  const html = buildHtmlEmail({
    title:
      params.purpose === 'verify'
        ? 'Verify Your Royal Katti Account'
        : 'Reset Your Royal Katti Password',
    subtitle:
      params.purpose === 'verify'
        ? 'Enter the 6-digit verification code below in the Royal Katti app to activate your Player ID.'
        : 'Enter the 6-digit password reset code below in the Royal Katti app to set a new password.',
    playerId: params.playerId,
    code: params.code,
  });

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    try {
      const fromAddr = process.env.EMAIL_FROM?.trim() || 'Royal Katti <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: fromAddr, to: [params.to], subject, html }),
      });
      if (res.ok) return { sent: true, provider: 'resend' };
    } catch {
      // fall through
    }
  }

  const brevoKey = process.env.BREVO_API_KEY?.trim();
  if (brevoKey) {
    try {
      const senderEmail = process.env.EMAIL_FROM?.trim() || 'noreply@royalkatti.app';
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Royal Katti VIP', email: senderEmail },
          to: [{ email: params.to }],
          subject,
          htmlContent: html,
        }),
      });
      if (res.ok) return { sent: true, provider: 'brevo' };
    } catch {
      // fall through
    }
  }

  const smtpUser = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').trim();
  if (smtpUser && smtpPass) {
    const ok = await sendViaSmtp({
      host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
      port: Number(process.env.SMTP_PORT || 465),
      user: smtpUser,
      pass: smtpPass,
      from: (process.env.EMAIL_FROM || smtpUser).trim(),
      to: params.to,
      subject,
      html,
    });
    if (ok) return { sent: true, provider: 'smtp' };
  }

  return { sent: false, provider: 'none' };
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

    const emailDispatch = await dispatchCodeEmail({
      to: targetUser.email,
      playerId: targetUser.uid,
      code,
      purpose: 'verify',
    });

    // Stateless signed verification token (contains ONLY tokenHash, never plaintext code)
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
      emailSent: emailDispatch.sent,
      emailProvider: emailDispatch.provider,
      verificationToken,
      expiresAt: expiresAt.toISOString(),
      message: 'Check your email inbox to verify your account and sign in.',
    });
  }

  // 2. Verify Email
  if (pathname === '/api/auth/verify-email' && method === 'POST') {
    const { identifier, email, code, verificationToken, firebaseIdToken } = body;
    const lookup = String(identifier || email || '').trim();
    const cleanCode = String(code || '').trim();

    let user = findUser(store, lookup);
    const decodedToken = verificationToken
      ? verifyPayload<{ user: ServerUserRecord; tokenHash: string }>(verificationToken)
      : null;

    if (!user && decodedToken?.user) {
      user = decodedToken.user;
    }

    // Path A: Verified via Firebase Auth email verification link or verified Google email ownership
    if (firebaseIdToken) {
      const verifiedEmail = await verifyFirebaseIdTokenEmail(String(firebaseIdToken));
      if (!verifiedEmail) {
        return sendJson(res, 400, {
          error: 'Your email has not been verified in Firebase yet. Click the verification link in your email first.',
        });
      }
      if (user && verifiedEmail !== user.email.trim().toLowerCase()) {
        return sendJson(res, 400, {
          error: `Verified email (${verifiedEmail}) does not match account email (${user.email}).`,
        });
      }
      if (!user) {
        return sendJson(res, 404, { error: 'Account not found. Please register again.' });
      }
      user.authProvider = 'email_verified';
      user.emailVerified = true;
      if (!store.users.some((u) => u.email === user!.email)) {
        store.users.push(user);
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

    // Path B: Verified via 6-digit email OTP code
    if (!cleanCode) {
      return sendJson(res, 400, { error: 'Please enter the 6-digit verification code sent to your email.' });
    }

    const expectedHash = hashResetCode(cleanCode);

    if (decodedToken && decodedToken.tokenHash === expectedHash && decodedToken.user) {
      user = {
        ...decodedToken.user,
        authProvider: 'email_verified',
        emailVerified: true,
      };
      const existingIdx = store.users.findIndex((u) => u.email === user!.email);
      if (existingIdx >= 0) {
        store.users[existingIdx] = user;
      } else {
        store.users.push(user);
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
    const { identifier, email, verificationToken } = body;
    const lookup = String(identifier || email || '').trim();
    let user = findUser(store, lookup);
    if (!user && verificationToken) {
      const dec = verifyPayload<{ user: ServerUserRecord }>(verificationToken);
      if (dec?.user) user = dec.user;
    }
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
    const emailDispatch = await dispatchCodeEmail({
      to: user.email,
      playerId: user.uid,
      code,
      purpose: 'verify',
    });
    const nextVerificationToken = signPayload({ user, tokenHash }, 900);
    return sendJson(res, 200, {
      ok: true,
      playerId: user.uid,
      email: user.email,
      emailSent: emailDispatch.sent,
      emailProvider: emailDispatch.provider,
      verificationToken: nextVerificationToken,
      message: 'Verification email resent to your inbox.',
    });
  }

  // 4. Login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { identifier, email, password, firebaseIdToken, firestoreProfile } = body;
    const lookup = String(identifier || email || '').trim();
    if (!lookup || !password) {
      return sendJson(res, 400, { error: 'Please enter your Email/Player ID and password.' });
    }

    const verifiedFirebaseEmail = firebaseIdToken
      ? await verifyFirebaseIdTokenEmail(String(firebaseIdToken))
      : null;

    let user = findUser(store, lookup);
    if (!user && verifiedFirebaseEmail) {
      user = findUser(store, verifiedFirebaseEmail);
      if (!user) {
        const restoredPlayerId = String(
          firestoreProfile?.playerId ||
            `${verifiedFirebaseEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '').slice(0, 12) || 'player'}_${Math.floor(100 + Math.random() * 900)}`
        ).toLowerCase();
        user = {
          id: Date.now(),
          uid: restoredPlayerId,
          playerId: restoredPlayerId,
          email: verifiedFirebaseEmail,
          displayName: String(firestoreProfile?.displayName || restoredPlayerId).slice(0, 64),
          passwordHash: hashPassword(String(password)),
          authProvider: 'email_verified',
          emailVerified: true,
          preferredSeat: ['A', 'B', 'C', 'D', 'E', 'F'].includes(firestoreProfile?.preferredSeat)
            ? firestoreProfile.preferredSeat
            : 'D',
          coins:
            typeof firestoreProfile?.coins === 'number'
              ? Math.max(50, Math.round(firestoreProfile.coins))
              : 1000,
          highestBalance:
            typeof firestoreProfile?.highestBalance === 'number'
              ? Math.max(1000, Math.round(firestoreProfile.highestBalance))
              : 1000,
          totalWins: Number(firestoreProfile?.totalWins || 0),
          totalRounds: Number(firestoreProfile?.totalRounds || 0),
          hasPasswordHash: true,
          createdAt: new Date().toISOString(),
        };
        store.users.push(user);
        saveServerStore(store);
      }
    }

    if (!user) {
      return sendJson(res, 401, {
        error: 'Account not found. Please Register first.',
      });
    }

    const firebaseEmailMatchesUser =
      Boolean(verifiedFirebaseEmail) &&
      verifiedFirebaseEmail === user.email.trim().toLowerCase();

    if (!firebaseEmailMatchesUser) {
      if (!verifyPassword(String(password), user.passwordHash)) {
        return sendJson(res, 401, { error: 'Invalid Email/Player ID or password.' });
      }
    } else {
      user.passwordHash = hashPassword(String(password));
      user.authProvider = 'email_verified';
      user.emailVerified = true;
      saveServerStore(store);
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
      const emailDispatch = await dispatchCodeEmail({
        to: user.email,
        playerId: user.uid,
        code,
        purpose: 'verify',
      });
      const verificationToken = signPayload({ user, tokenHash }, 900);
      return sendJson(res, 403, {
        requiresVerification: true,
        playerId: user.uid,
        email: user.email,
        emailSent: emailDispatch.sent,
        emailProvider: emailDispatch.provider,
        verificationToken,
        error: 'Please verify your email address to finish activating your account.',
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
    const emailDispatch = await dispatchCodeEmail({
      to: user.email,
      playerId: user.uid,
      code,
      purpose: 'reset',
    });
    const resetToken = signPayload({ user, tokenHash }, 900);
    return sendJson(res, 200, {
      ok: true,
      playerId: user.uid,
      email: user.email,
      emailSent: emailDispatch.sent,
      emailProvider: emailDispatch.provider,
      resetToken,
    });
  }

  // 6. Reset Password
  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    const { identifier, email, code, newPassword, resetToken, firebaseIdToken } = body;
    const lookup = String(identifier || email || '').trim();
    const cleanCode = String(code || '').trim();
    if (!newPassword || String(newPassword).length < 6) {
      return sendJson(res, 400, {
        error: 'A new password (min 6 characters) is required.',
      });
    }

    let user = findUser(store, lookup);
    const decodedReset = resetToken
      ? verifyPayload<{ user: ServerUserRecord; tokenHash: string }>(resetToken)
      : null;

    if (!user && decodedReset?.user) {
      user = decodedReset.user;
    }

    if (firebaseIdToken) {
      const verifiedEmail = await verifyFirebaseIdTokenEmail(String(firebaseIdToken));
      if (!verifiedEmail || (user && verifiedEmail !== user.email.trim().toLowerCase())) {
        return sendJson(res, 400, { error: 'Verified email does not match this account.' });
      }
      if (!user) {
        return sendJson(res, 404, { error: 'Account not found.' });
      }
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

    if (!cleanCode) {
      return sendJson(res, 400, {
        error: 'Please enter the 6-digit reset code sent to your email.',
      });
    }

    const expectedHash = hashResetCode(cleanCode);

    if (decodedReset && decodedReset.tokenHash === expectedHash && decodedReset.user) {
      const newHash = hashPassword(String(newPassword));
      user = {
        ...decodedReset.user,
        passwordHash: newHash,
        authProvider: 'email_verified',
        emailVerified: true,
      };
      const existingIdx = store.users.findIndex((u) => u.email === user!.email);
      if (existingIdx >= 0) {
        store.users[existingIdx] = user;
      } else {
        store.users.push(user);
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
    if (method === 'GET') {
      const requestedCode = String(parsedUrl.searchParams.get('roomCode') || '')
        .trim()
        .toUpperCase();
      if (requestedCode) {
        const found = store.rooms.find((r) => r.roomCode === requestedCode);
        if (!found) return sendJson(res, 404, { error: 'Room not found' });
        return sendJson(res, 200, { room: found });
      }
      return sendJson(res, 200, { rooms: store.rooms });
    }
    if (method === 'POST') {
      const rawCustom = String(body.customCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 12);
      const code =
        rawCustom && rawCustom.length >= 4 && !store.rooms.some((r) => r.roomCode === rawCustom)
          ? rawCustom
          : `RK-${crypto.randomInt(1000, 9999)}`;
      const hostName = String(body.hostName || 'Player').trim();
      const roomName = String(body.roomName || `${hostName}'s Table`).trim();
      const seat = ['A', 'B', 'C', 'D', 'E', 'F'].includes(body.preferredSeat)
        ? body.preferredSeat
        : 'D';
      const newRoom: any = {
        roomCode: code,
        roomName,
        hostName,
        dealerSeat: 'A',
        cutterSeat: 'B',
        phase: 'shuffling',
        playerCount: 1,
        maxPlayers: 6,
        occupiedSeats: { [seat]: hostName },
        chat: [
          {
            id: `init-${code}`,
            sender: hostName,
            seatId: seat,
            text: `Created room ${roomName} (${code}). Invite players with code ${code}!`,
            timestamp: Date.now(),
          },
        ],
        isPublic: true,
      };
      store.rooms.unshift(newRoom);
      saveServerStore(store);
      return sendJson(res, 201, { room: newRoom, assignedSeat: seat });
    }
  }

  if (pathname === '/api/rooms/join' && method === 'POST') {
    const rawCode = String(body.roomCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');
    if (!rawCode) {
      return sendJson(res, 400, { error: 'Please enter a valid Room Code.' });
    }
    const playerName = String(body.playerName || 'Royal Player').trim();
    const preferredSeat = ['A', 'B', 'C', 'D', 'E', 'F'].includes(body.seatId)
      ? body.seatId
      : 'D';

    let room: any = store.rooms.find((r) => r.roomCode === rawCode);
    if (!room) {
      room = {
        roomCode: rawCode,
        roomName: `Royal Table ${rawCode}`,
        hostName: playerName,
        dealerSeat: 'A',
        cutterSeat: 'B',
        phase: 'shuffling',
        playerCount: 1,
        maxPlayers: 6,
        occupiedSeats: {},
        chat: [],
        isPublic: true,
      };
      store.rooms.unshift(room);
    }
    if (!room.occupiedSeats) room.occupiedSeats = {};
    if (!room.chat) room.chat = [];

    for (const [sKey, occ] of Object.entries(room.occupiedSeats)) {
      if (occ === playerName && sKey !== preferredSeat) {
        delete room.occupiedSeats[sKey];
      }
    }

    const allSeats = ['D', 'C', 'E', 'B', 'A', 'F'];
    let assignedSeat = preferredSeat;
    if (room.occupiedSeats[assignedSeat] && room.occupiedSeats[assignedSeat] !== playerName) {
      const free = allSeats.find((s) => !room.occupiedSeats[s]);
      if (free) assignedSeat = free;
    }

    const alreadyInSeat = room.occupiedSeats[assignedSeat] === playerName;
    room.occupiedSeats[assignedSeat] = playerName;
    room.playerCount = Math.max(1, Object.keys(room.occupiedSeats).length);

    if (!alreadyInSeat) {
      room.chat.push({
        id: `join-${Date.now()}`,
        sender: playerName,
        seatId: assignedSeat,
        text: `Joined via Room Code ${rawCode} (Seat ${assignedSeat})`,
        timestamp: Date.now(),
      });
    }
    saveServerStore(store);
    return sendJson(res, 200, { room, assignedSeat });
  }

  if (pathname === '/api/rooms/leave' && method === 'POST') {
    const rawCode = String(body.roomCode || '').trim().toUpperCase();
    const playerName = String(body.playerName || '').trim();
    const room: any = store.rooms.find((r) => r.roomCode === rawCode);
    if (room && room.occupiedSeats && playerName) {
      for (const [sKey, occ] of Object.entries(room.occupiedSeats)) {
        if (occ === playerName) delete room.occupiedSeats[sKey];
      }
      room.playerCount = Math.max(1, Object.keys(room.occupiedSeats).length);
      saveServerStore(store);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/rooms/chat' && method === 'POST') {
    const rawCode = String(body.roomCode || '').trim().toUpperCase();
    const sender = String(body.sender || 'Player').trim();
    const seatId = ['A', 'B', 'C', 'D', 'E', 'F'].includes(body.seatId) ? body.seatId : 'D';
    const text = String(body.text || '').trim().slice(0, 140);
    const room: any = store.rooms.find((r) => r.roomCode === rawCode);
    if (!room || !text) return sendJson(res, 404, { error: 'Room not found' });
    if (!room.chat) room.chat = [];
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender,
      seatId,
      text,
      timestamp: Date.now(),
    };
    room.chat = [...room.chat.slice(-24), message];
    saveServerStore(store);
    return sendJson(res, 200, { ok: true, room, message });
  }

  if (pathname === '/api/rooms/invite' && method === 'POST') {
    const roomCode = String(body.roomCode || '').trim().toUpperCase();
    const roomName = String(body.roomName || `Table ${roomCode}`).trim();
    const fromPlayerName = String(body.fromPlayerName || 'Royal Host').trim();
    const fromPlayerId = String(body.fromPlayerId || fromPlayerName).trim();
    const targetIdentifier = String(body.targetIdentifier || '').trim().toLowerCase();
    if (!roomCode || !targetIdentifier) {
      return sendJson(res, 400, { error: 'Room Code and target Player ID are required.' });
    }
    const storeAny = store as any;
    if (!Array.isArray(storeAny.invites)) storeAny.invites = [];
    const invite = {
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      roomCode,
      roomName,
      fromPlayerName,
      fromPlayerId,
      targetIdentifier,
      createdAt: Date.now(),
      dismissed: false,
    };
    storeAny.invites.unshift(invite);
    saveServerStore(store);
    return sendJson(res, 201, {
      ok: true,
      invite,
      message: `Invitation to room ${roomCode} sent to ${targetIdentifier}!`,
    });
  }

  if (pathname === '/api/rooms/invites' && method === 'GET') {
    const playerId = String(parsedUrl.searchParams.get('playerId') || '').trim().toLowerCase();
    const email = String(parsedUrl.searchParams.get('email') || '').trim().toLowerCase();
    const displayName = String(parsedUrl.searchParams.get('displayName') || '').trim().toLowerCase();
    const storeAny = store as any;
    const invitesList: any[] = Array.isArray(storeAny.invites) ? storeAny.invites : [];
    const cutoff = Date.now() - 30 * 60 * 1000;
    const matching = invitesList.filter((inv) => {
      if (inv.dismissed || inv.createdAt < cutoff) return false;
      if (inv.targetIdentifier === 'all') return true;
      return (
        (playerId && inv.targetIdentifier === playerId) ||
        (email && inv.targetIdentifier === email) ||
        (displayName && inv.targetIdentifier === displayName)
      );
    });
    return sendJson(res, 200, { invites: matching.slice(0, 10) });
  }

  if (pathname === '/api/rooms/invites/dismiss' && method === 'POST') {
    const inviteId = String(body.inviteId || '').trim();
    const storeAny = store as any;
    if (Array.isArray(storeAny.invites)) {
      const found = storeAny.invites.find((i: any) => i.id === inviteId);
      if (found) found.dismissed = true;
      saveServerStore(store);
    }
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Not found' });
}
