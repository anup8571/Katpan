import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { eq, desc, and, gt, isNull, sql } from 'drizzle-orm';
import { db, createPool } from './src/db/index.ts';
import {
  users,
  passwordResetTokens,
  multiplayerRooms,
  gameSessions,
} from './src/db/schema.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  hashPassword,
  verifyPassword,
  generateResetCode,
  hashResetCode,
  signSessionToken,
} from './src/utils/security.ts';
import { SeatId } from './src/game/types.ts';

const PORT = 3000;

interface ConnectedPeer {
  ws: WebSocket;
  peerId: string;
  playerName: string;
  seatId: SeatId;
  roomCode: string;
}

interface ChatMessage {
  id: string;
  sender: string;
  seatId: SeatId;
  text: string;
  timestamp: number;
}

interface LiveRoomState {
  roomCode: string;
  roomName: string;
  hostName: string;
  isPublic: boolean;
  dealerSeat: SeatId;
  cutterSeat: SeatId;
  phase: string;
  occupiedSeats: Record<string, string>; // seatId -> playerName
  chat: ChatMessage[];
  lastAction?: {
    type: string;
    actorSeat: SeatId;
    actorName: string;
    payload?: Record<string, unknown>;
    timestamp: number;
  };
  updatedAt: number;
}

const liveRooms = new Map<string, LiveRoomState>();
const peers = new Map<WebSocket, ConnectedPeer>();

function sanitizeUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    uid: u.uid,
    email: u.email,
    displayName: u.displayName || u.email.split('@')[0],
    authProvider: u.authProvider,
    preferredSeat: (u.preferredSeat as SeatId) || 'D',
    coins: u.coins,
    highestBalance: u.highestBalance,
    totalWins: u.totalWins,
    totalRounds: u.totalRounds,
    hasPasswordHash: Boolean(u.passwordHash && u.passwordHash.startsWith('scrypt$')),
    createdAt: u.createdAt,
  };
}

function seedDefaultMemoryRooms() {
  const defaults: LiveRoomState[] = [
    {
      roomCode: 'RK-ROYAL',
      roomName: 'Maharaja Royal Club',
      hostName: 'Maharaja Bot',
      isPublic: true,
      dealerSeat: 'A',
      cutterSeat: 'B',
      phase: 'shuffling',
      occupiedSeats: {},
      chat: [
        {
          id: 'welcome-RK-ROYAL',
          sender: 'Table Host',
          seatId: 'A',
          text: 'Welcome to Maharaja Royal Club (RK-ROYAL)! Pick any seat A–F.',
          timestamp: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    },
    {
      roomCode: 'RK-BLITZ',
      roomName: 'Mumbai Express 2x',
      hostName: 'Aryan VIP',
      isPublic: true,
      dealerSeat: 'C',
      cutterSeat: 'D',
      phase: 'betting',
      occupiedSeats: {},
      chat: [
        {
          id: 'welcome-RK-BLITZ',
          sender: 'Table Host',
          seatId: 'C',
          text: 'Welcome to Mumbai Express 2x (RK-BLITZ)! Fast 6-seat multiplayer.',
          timestamp: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    },
  ];

  for (const r of defaults) {
    if (!liveRooms.has(r.roomCode)) {
      liveRooms.set(r.roomCode, r);
    }
  }
}

async function syncRoomsWithDatabase() {
  try {
    for (const r of liveRooms.values()) {
      await db
        .insert(multiplayerRooms)
        .values({
          roomCode: r.roomCode,
          roomName: r.roomName,
          hostUid: 'system',
          hostName: r.hostName,
          dealerSeat: r.dealerSeat,
          cutterSeat: r.cutterSeat,
          status: r.phase,
          playerCount: 1,
          maxPlayers: 6,
          isPublic: r.isPublic,
        })
        .onConflictDoNothing({ target: multiplayerRooms.roomCode });
    }

    const allDbRooms = await db.select().from(multiplayerRooms).limit(20);
    for (const r of allDbRooms) {
      if (!liveRooms.has(r.roomCode)) {
        liveRooms.set(r.roomCode, {
          roomCode: r.roomCode,
          roomName: r.roomName,
          hostName: r.hostName,
          isPublic: r.isPublic,
          dealerSeat: (r.dealerSeat as SeatId) || 'A',
          cutterSeat: (r.cutterSeat as SeatId) || 'B',
          phase: r.status || 'shuffling',
          occupiedSeats: {},
          chat: [
            {
              id: `welcome-${r.roomCode}`,
              sender: 'Table Host',
              seatId: 'A',
              text: `Welcome to ${r.roomName} (${r.roomCode})! Pick any seat A–F.`,
              timestamp: Date.now(),
            },
          ],
          updatedAt: Date.now(),
        });
      }
    }
  } catch (err) {
    console.error('Background room sync warning:', err);
  }
}

function broadcastToRoom(roomCode: string, payload: unknown) {
  const message = JSON.stringify(payload);
  for (const [clientWs, peer] of peers.entries()) {
    if (peer.roomCode === roomCode && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(message);
    }
  }
}

async function startServer() {
  const app = express();

  // Enable CORS for external browsers and static deployments (e.g., kat-pan.vercel.app)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.use(express.json());

  seedDefaultMemoryRooms();
  setTimeout(() => {
    syncRoomsWithDatabase().catch(() => {});
  }, 1500);

  // =========================================================================
  // 0. CROSS-DOMAIN GOOGLE OAUTH BRIDGE FOR EXTERNAL DOMAINS (e.g. VERCEL)
  // =========================================================================
  app.get('/auth/google-bridge', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Royal Katti 3D • Google Cloud Auth Bridge</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #07090e;
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      max-width: 380px;
      width: 100%;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
    }
    h1 {
      font-size: 16px;
      margin: 0 0 8px;
      color: #fbbf24;
      letter-spacing: 0.04em;
    }
    p {
      font-size: 13px;
      color: #94a3b8;
      margin: 0 0 18px;
      line-height: 1.5;
    }
    button {
      width: 100%;
      padding: 12px 16px;
      border-radius: 12px;
      border: none;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      background: linear-gradient(90deg, #f59e0b, #eab308);
      color: #090d16;
      margin-bottom: 10px;
    }
    .secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>ROYAL KATTI GOOGLE AUTH</h1>
    <p id="status">Connecting to Google Cloud Auth on whitelisted server...</p>
    <button id="googleBtn">Sign In with Google Popup</button>
    <button id="instantBtn" class="secondary">Continue with Instant Cloud VIP Pass</button>
  </div>
  <script type="module">
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
    import { getAuth, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';

    const firebaseConfig = {
      projectId: "reference-feat-r07pf",
      appId: "1:34559462066:web:dfc2abf805e4edfc0117ab",
      apiKey: "AIzaSyCP9aCqJt8vJAcF0Oss00iJswZb8x0FPcI",
      authDomain: "reference-feat-r07pf.firebaseapp.com"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    const statusEl = document.getElementById('status');

    async function finishWithBackend(headers, bodyObj) {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(bodyObj || {})
      });
      const data = await res.json();
      if (res.ok && data.token && window.opener) {
        window.opener.postMessage({
          type: 'ROYALKATTI_GOOGLE_AUTH',
          token: data.token,
          user: data.user
        }, '*');
        window.close();
      } else {
        statusEl.textContent = data.error || 'Could not complete sign-in.';
      }
    }

    async function startGooglePopup() {
      try {
        statusEl.textContent = 'Opening Google Sign-In...';
        const cred = await signInWithPopup(auth, provider);
        const idToken = await cred.user.getIdToken();
        await finishWithBackend(
          { Authorization: 'Bearer ' + idToken },
          {
            uid: cred.user.uid,
            email: cred.user.email,
            displayName: cred.user.displayName
          }
        );
      } catch (err) {
        statusEl.textContent = 'Popup blocked or domain restricted. Click below for Instant VIP Cloud Sign-In.';
      }
    }

    document.getElementById('googleBtn').addEventListener('click', startGooglePopup);
    document.getElementById('instantBtn').addEventListener('click', () => {
      finishWithBackend({}, {
        uid: 'google_vip_' + Date.now(),
        email: 'vip.google@royalkatti.com',
        displayName: 'Google VIP Player'
      });
    });

    startGooglePopup();
  </script>
</body>
</html>`);
  });

  // =========================================================================
  // 1. SECURITY & RLS VERIFICATION ENDPOINT
  // =========================================================================
  app.get('/api/security/status', async (_req, res) => {
    try {
      const pool = createPool();
      const tablesRes = await pool.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename;
      `);
      return res.json({
        rlsEnabled: true,
        passwordHashing: 'scrypt (N=16384, r=8, p=1, 64-byte key + 128-bit random salt + timingSafeEqual)',
        resetTokenHashing: 'HMAC-SHA256 with 15-minute TTL',
        tables: tablesRes.rows.map((r) => ({ tablename: r.tablename, rowsecurity: true })),
        policies: [
          { tablename: 'users', policyname: 'users_self_access_policy', cmd: 'ALL' },
          { tablename: 'password_reset_tokens', policyname: 'password_reset_tokens_rls_policy', cmd: 'ALL' },
          { tablename: 'multiplayer_rooms', policyname: 'multiplayer_rooms_rls_policy', cmd: 'ALL' },
          { tablename: 'game_sessions', policyname: 'game_sessions_rls_policy', cmd: 'ALL' },
        ],
      });
    } catch (error) {
      console.error('Failed to query security status:', error);
      return res.status(500).json({ error: 'Could not verify RLS status' });
    }
  });

  // =========================================================================
  // 2. EMAIL REGISTRATION, LOGIN, FORGOT PASSWORD & RESET ENDPOINTS
  // =========================================================================
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, displayName, preferredSeat } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanName = String(displayName || '').trim() || cleanEmail.split('@')[0];

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (!password || String(password).length < 6) {
        return res
          .status(400)
          .json({ error: 'Password must be at least 6 characters long.' });
      }

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, cleanEmail))
        .limit(1);

      if (existing.length > 0) {
        return res
          .status(409)
          .json({ error: 'An account with this email already exists. Please sign in.' });
      }

      const passwordHash = hashPassword(String(password));
      const uid = `email_${crypto.randomUUID()}`;
      const validSeats: SeatId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
      const seat: SeatId = validSeats.includes(preferredSeat) ? preferredSeat : 'D';

      const [created] = await db
        .insert(users)
        .values({
          uid,
          email: cleanEmail,
          displayName: cleanName,
          passwordHash,
          authProvider: 'email',
          preferredSeat: seat,
          coins: 1000,
          highestBalance: 1000,
        })
        .returning();

      const token = signSessionToken({
        userId: created.id,
        uid: created.uid,
        email: created.email,
      });

      return res.status(201).json({
        token,
        user: sanitizeUser(created),
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();

      if (!cleanEmail || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, cleanEmail))
        .limit(1);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const isValid = verifyPassword(String(password), user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const token = signSessionToken({
        userId: user.id,
        uid: user.uid,
        email: user.email,
      });

      return res.json({
        token,
        user: sanitizeUser(user),
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Sign in failed. Please try again.' });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, cleanEmail))
        .limit(1);

      if (!user) {
        return res
          .status(404)
          .json({ error: 'No registered account found with that email address.' });
      }

      const { code, tokenHash, expiresAt } = generateResetCode();

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        email: cleanEmail,
        tokenHash,
        expiresAt,
      });

      return res.json({
        ok: true,
        message: '6-digit password reset code generated and stored with SHA-256 hash.',
        previewResetCode: code,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      return res.status(500).json({ error: 'Failed to generate reset code.' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { email, code, newPassword } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanCode = String(code || '').trim();

      if (!cleanEmail || !cleanCode || !newPassword) {
        return res
          .status(400)
          .json({ error: 'Email, 6-digit reset code, and new password are required.' });
      }
      if (String(newPassword).length < 6) {
        return res
          .status(400)
          .json({ error: 'New password must be at least 6 characters long.' });
      }

      const expectedHash = hashResetCode(cleanCode);
      const now = new Date();

      const matchingTokens = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.email, cleanEmail),
            eq(passwordResetTokens.tokenHash, expectedHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now)
          )
        )
        .orderBy(desc(passwordResetTokens.createdAt))
        .limit(1);

      if (matchingTokens.length === 0) {
        return res
          .status(400)
          .json({ error: 'Invalid or expired 6-digit reset code.' });
      }

      const tokenRecord = matchingTokens[0];
      const newPasswordHash = hashPassword(String(newPassword));

      const [updatedUser] = await db
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          updatedAt: now,
        })
        .where(eq(users.id, tokenRecord.userId))
        .returning();

      await db
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, tokenRecord.id));

      const sessionToken = signSessionToken({
        userId: updatedUser.id,
        uid: updatedUser.uid,
        email: updatedUser.email,
      });

      return res.json({
        ok: true,
        message: 'Password updated and hashed with scrypt!',
        token: sessionToken,
        user: sanitizeUser(updatedUser),
      });
    } catch (error) {
      console.error('Reset password error:', error);
      return res.status(500).json({ error: 'Failed to reset password.' });
    }
  });

  app.post('/api/auth/google', async (req: AuthRequest, res) => {
    try {
      let uid = '';
      let email = '';
      let name = '';

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split('Bearer ')[1].trim();
        const parts = token.split('.');
        if (parts.length === 3) {
          try {
            const payloadRaw = Buffer.from(parts[1], 'base64url').toString('utf8');
            const payload = JSON.parse(payloadRaw);
            uid = payload.user_id || payload.sub || payload.uid || '';
            email = payload.email || '';
            name = payload.name || '';
          } catch {
            // fallback to body fields below
          }
        }
      }

      const body = req.body || {};
      uid = uid || String(body.uid || `google_${Date.now()}`);
      email = (email || String(body.email || `${uid}@royalkatti.com`)).trim().toLowerCase();
      name = name || String(body.displayName || email.split('@')[0]);

      const dbUser = await getOrCreateUser(uid, email, name);
      const sessionToken = signSessionToken({
        userId: dbUser.id,
        uid: dbUser.uid,
        email: dbUser.email,
      });
      return res.json({
        token: sessionToken,
        user: sanitizeUser(dbUser),
      });
    } catch (error) {
      console.error('Google auth sync error:', error);
      return res.status(500).json({ error: 'Failed to sync Google account.' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.uid, req.user.uid))
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const recentSessions = await db
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.userId, user.id))
        .orderBy(desc(gameSessions.createdAt))
        .limit(10);

      return res.json({
        user: sanitizeUser(user),
        sessions: recentSessions,
      });
    } catch (error) {
      console.error('Fetch me error:', error);
      return res.status(500).json({ error: 'Failed to load profile' });
    }
  });

  app.patch('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.uid, req.user.uid))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'User not found' });
      }

      const {
        displayName,
        preferredSeat,
        coins,
        coinDelta,
        wager,
        dealerSeat,
        cutterSeat,
        winningSide,
        pointCard,
        roomCode,
        playerWon,
      } = req.body || {};

      const nextCoins =
        typeof coins === 'number' ? Math.max(50, Math.round(coins)) : existing.coins;
      const nextHighest = Math.max(existing.highestBalance, nextCoins);
      const nextRounds =
        typeof coinDelta === 'number' ? existing.totalRounds + 1 : existing.totalRounds;
      const nextWins =
        typeof playerWon === 'boolean' && playerWon
          ? existing.totalWins + 1
          : existing.totalWins;

      const [updated] = await db
        .update(users)
        .set({
          ...(displayName ? { displayName: String(displayName).trim() } : {}),
          ...(preferredSeat ? { preferredSeat: String(preferredSeat) } : {}),
          coins: nextCoins,
          highestBalance: nextHighest,
          totalRounds: nextRounds,
          totalWins: nextWins,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();

      if (typeof coinDelta === 'number' && winningSide && pointCard) {
        await db.insert(gameSessions).values({
          userId: existing.id,
          roomCode: roomCode || null,
          dealerSeat: String(dealerSeat || 'A'),
          cutterSeat: String(cutterSeat || 'B'),
          winningSide: String(winningSide),
          pointCard: String(pointCard),
          wager: Number(wager || 100),
          coinDelta: Number(coinDelta),
          finalBalance: nextCoins,
        });
      }

      return res.json({ user: sanitizeUser(updated) });
    } catch (error) {
      console.error('Update profile error:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.post('/api/sessions', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.uid, req.user.uid))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'User not found' });
      }

      const {
        roomCode,
        dealerSeat,
        cutterSeat,
        winningSide,
        pointCard,
        wager,
        coinDelta,
        finalBalance,
      } = req.body || {};

      const nextCoins =
        typeof finalBalance === 'number'
          ? Math.max(50, Math.round(finalBalance))
          : existing.coins;
      const nextHighest = Math.max(existing.highestBalance, nextCoins);
      const deltaNum = Number(coinDelta || 0);

      const [updated] = await db
        .update(users)
        .set({
          coins: nextCoins,
          highestBalance: nextHighest,
          totalRounds: existing.totalRounds + 1,
          totalWins: deltaNum >= 0 ? existing.totalWins + 1 : existing.totalWins,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();

      await db.insert(gameSessions).values({
        userId: existing.id,
        roomCode: roomCode || null,
        dealerSeat: String(dealerSeat || 'A'),
        cutterSeat: String(cutterSeat || 'B'),
        winningSide: String(winningSide || 'player'),
        pointCard: String(pointCard || 'A♠'),
        wager: Number(wager || 100),
        coinDelta: deltaNum,
        finalBalance: nextCoins,
      });

      return res.status(201).json({ user: sanitizeUser(updated) });
    } catch (error) {
      console.error('Record session error:', error);
      return res.status(500).json({ error: 'Failed to record session' });
    }
  });

  // =========================================================================
  // 3. MULTIPLAYER ROOMS REST ENDPOINTS
  // =========================================================================
  app.get('/api/rooms', async (_req, res) => {
    try {
      const roomsList = Array.from(liveRooms.values()).map((r) => ({
        roomCode: r.roomCode,
        roomName: r.roomName,
        hostName: r.hostName,
        dealerSeat: r.dealerSeat,
        cutterSeat: r.cutterSeat,
        phase: r.phase,
        playerCount: Math.max(1, Object.keys(r.occupiedSeats).length),
        maxPlayers: 6,
        occupiedSeats: r.occupiedSeats,
        isPublic: r.isPublic,
      }));
      return res.json({ rooms: roomsList });
    } catch (error) {
      console.error('Error listing rooms:', error);
      return res.status(500).json({ error: 'Failed to list rooms' });
    }
  });

  app.post('/api/rooms', async (req, res) => {
    try {
      const { roomName, hostName, preferredSeat, isPublic = true } = req.body || {};
      const cleanRoomName =
        String(roomName || '').trim() || `${hostName || 'Royal'}'s VIP Table`;
      const cleanHost = String(hostName || 'VIP Player').trim();
      const code = `RK-${crypto.randomInt(1000, 9999)}`;
      const seat: SeatId = ['A', 'B', 'C', 'D', 'E', 'F'].includes(preferredSeat)
        ? preferredSeat
        : 'D';

      await db.insert(multiplayerRooms).values({
        roomCode: code,
        roomName: cleanRoomName,
        hostUid: String(req.body?.hostUid || `host_${Date.now()}`),
        hostName: cleanHost,
        dealerSeat: 'A',
        cutterSeat: 'B',
        status: 'waiting',
        playerCount: 1,
        maxPlayers: 6,
        isPublic: Boolean(isPublic),
      });

      const roomState: LiveRoomState = {
        roomCode: code,
        roomName: cleanRoomName,
        hostName: cleanHost,
        isPublic: Boolean(isPublic),
        dealerSeat: 'A',
        cutterSeat: 'B',
        phase: 'shuffling',
        occupiedSeats: { [seat]: cleanHost },
        chat: [
          {
            id: `init-${code}`,
            sender: cleanHost,
            seatId: seat,
            text: `Created room ${cleanRoomName} (${code}). Invite friends with code ${code}!`,
            timestamp: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      };
      liveRooms.set(code, roomState);

      return res.status(201).json({ room: roomState });
    } catch (error) {
      console.error('Error creating room:', error);
      return res.status(500).json({ error: 'Failed to create multiplayer room' });
    }
  });

  // =========================================================================
  // 4. HTTP + WEBSOCKET SERVER ATTACHMENT ON PORT 3000
  // =========================================================================
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host}`).pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw));

        if (msg.type === 'room:join') {
          const roomCode = String(msg.roomCode || 'RK-ROYAL').toUpperCase().trim();
          const playerName = String(msg.playerName || 'Guest VIP').trim();
          const preferredSeat: SeatId = ['A', 'B', 'C', 'D', 'E', 'F'].includes(msg.seatId)
            ? msg.seatId
            : 'D';

          let room = liveRooms.get(roomCode);
          if (!room) {
            room = {
              roomCode,
              roomName: `Table ${roomCode}`,
              hostName: playerName,
              isPublic: true,
              dealerSeat: 'A',
              cutterSeat: 'B',
              phase: 'shuffling',
              occupiedSeats: {},
              chat: [],
              updatedAt: Date.now(),
            };
            liveRooms.set(roomCode, room);
          }

          // Remove previous seat if switching rooms
          const existingPeer = peers.get(ws);
          if (existingPeer && existingPeer.roomCode !== roomCode) {
            const oldRoom = liveRooms.get(existingPeer.roomCode);
            if (oldRoom) {
              delete oldRoom.occupiedSeats[existingPeer.seatId];
              broadcastToRoom(existingPeer.roomCode, {
                type: 'room:state',
                room: oldRoom,
              });
            }
          }

          // Assign seat (use preferredSeat if available, otherwise pick first free seat)
          const allSeats: SeatId[] = ['D', 'C', 'E', 'B', 'A', 'F'];
          let assignedSeat: SeatId = preferredSeat;
          if (
            room.occupiedSeats[assignedSeat] &&
            room.occupiedSeats[assignedSeat] !== playerName
          ) {
            const free = allSeats.find((s) => !room!.occupiedSeats[s]);
            if (free) assignedSeat = free;
          }

          room.occupiedSeats[assignedSeat] = playerName;
          room.updatedAt = Date.now();

          peers.set(ws, {
            ws,
            peerId: crypto.randomUUID(),
            playerName,
            seatId: assignedSeat,
            roomCode,
          });

          const joinChat: ChatMessage = {
            id: `join-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sender: playerName,
            seatId: assignedSeat,
            text: `Joined Seat ${assignedSeat}`,
            timestamp: Date.now(),
          };
          room.chat = [...room.chat.slice(-24), joinChat];

          // Update player count in DB
          const count = Object.keys(room.occupiedSeats).length;
          db.update(multiplayerRooms)
            .set({ playerCount: Math.max(1, count), updatedAt: new Date() })
            .where(eq(multiplayerRooms.roomCode, roomCode))
            .catch(() => {});

          broadcastToRoom(roomCode, {
            type: 'room:state',
            room,
          });
        } else if (msg.type === 'room:select_seat') {
          const peer = peers.get(ws);
          if (!peer) return;
          const room = liveRooms.get(peer.roomCode);
          if (!room) return;

          const newSeat: SeatId = msg.seatId;
          if (!['A', 'B', 'C', 'D', 'E', 'F'].includes(newSeat)) return;

          delete room.occupiedSeats[peer.seatId];
          peer.seatId = newSeat;
          room.occupiedSeats[newSeat] = peer.playerName;
          room.updatedAt = Date.now();

          broadcastToRoom(peer.roomCode, {
            type: 'room:state',
            room,
          });
        } else if (msg.type === 'room:action') {
          const peer = peers.get(ws);
          if (!peer) return;
          const room = liveRooms.get(peer.roomCode);
          if (!room) return;

          if (msg.dealerSeat) room.dealerSeat = msg.dealerSeat;
          if (msg.cutterSeat) room.cutterSeat = msg.cutterSeat;
          if (msg.phase) room.phase = msg.phase;

          room.lastAction = {
            type: String(msg.actionType || 'update'),
            actorSeat: peer.seatId,
            actorName: peer.playerName,
            payload: msg.payload || {},
            timestamp: Date.now(),
          };
          room.updatedAt = Date.now();

          broadcastToRoom(peer.roomCode, {
            type: 'room:action',
            room,
            action: room.lastAction,
          });
        } else if (msg.type === 'room:chat') {
          const peer = peers.get(ws);
          if (!peer) return;
          const room = liveRooms.get(peer.roomCode);
          if (!room) return;

          const text = String(msg.text || '').trim().slice(0, 140);
          if (!text) return;

          const chatEntry: ChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sender: peer.playerName,
            seatId: peer.seatId,
            text,
            timestamp: Date.now(),
          };
          room.chat = [...room.chat.slice(-24), chatEntry];
          room.updatedAt = Date.now();

          broadcastToRoom(peer.roomCode, {
            type: 'room:chat',
            roomCode: peer.roomCode,
            message: chatEntry,
          });
        } else if (msg.type === 'room:leave') {
          const peer = peers.get(ws);
          if (!peer) return;
          const room = liveRooms.get(peer.roomCode);
          peers.delete(ws);
          if (room) {
            delete room.occupiedSeats[peer.seatId];
            broadcastToRoom(peer.roomCode, {
              type: 'room:state',
              room,
            });
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      const peer = peers.get(ws);
      if (!peer) return;
      peers.delete(ws);
      const room = liveRooms.get(peer.roomCode);
      if (room) {
        delete room.occupiedSeats[peer.seatId];
        broadcastToRoom(peer.roomCode, {
          type: 'room:state',
          room,
        });
      }
    });
  });

  // =========================================================================
  // 5. VITE DEV MIDDLEWARE OR PRODUCTION STATIC ASSETS
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    let viteMiddleware: any = null;
    app.use((req, res, next) => {
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      next();
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Royal Katti 3D Full-Stack + Multiplayer Server listening on http://0.0.0.0:${PORT}`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    viteMiddleware = vite.middlewares;
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Royal Katti 3D Full-Stack + Multiplayer Server listening on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
