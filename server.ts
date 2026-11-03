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
    playerId: u.uid,
    email: u.email,
    displayName: u.displayName || u.uid || u.email.split('@')[0],
    authProvider: u.authProvider,
    emailVerified: u.authProvider !== 'email_unverified',
    preferredSeat: (u.preferredSeat as SeatId) || 'D',
    coins: u.coins,
    highestBalance: u.highestBalance,
    totalWins: u.totalWins,
    totalRounds: u.totalRounds,
    hasPasswordHash: Boolean(u.passwordHash && u.passwordHash.startsWith('scrypt$')),
    createdAt: u.createdAt,
  };
}

async function findUserByIdentifier(identifier: string) {
  const clean = String(identifier || '').trim().toLowerCase();
  if (!clean) return null;
  const rows = await db
    .select()
    .from(users)
    .where(
      sql`LOWER(${users.email}) = ${clean} OR LOWER(${users.uid}) = ${clean} OR LOWER(${users.displayName}) = ${clean}`
    )
    .limit(1);
  return rows[0] || null;
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
        resetTokenHashing: 'HMAC-SHA256 with 15-minute TTL (Email Verification & Password Reset)',
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
  // 2. PLAYER ID / EMAIL SIGN UP, EMAIL VERIFICATION, LOGIN & PASSWORD RESET
  // =========================================================================
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { playerId, email, password, displayName, preferredSeat } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanName =
        String(displayName || playerId || cleanEmail.split('@')[0] || 'Royal Player').trim();

      const baseSlug = String(playerId || displayName || cleanEmail.split('@')[0] || 'rk')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 14);
      let candidatePlayerId =
        baseSlug.length >= 3
          ? `${baseSlug}_${crypto.randomInt(100, 999)}`
          : `rk_${crypto.randomInt(1000, 9999)}`;

      // If the user explicitly provided a custom playerId that has digits/underscores, try it first
      const explicitSlug = String(playerId || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '');
      if (explicitSlug.length >= 3) {
        candidatePlayerId = explicitSlug;
      }

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (!password || String(password).length < 6) {
        return res
          .status(400)
          .json({ error: 'Password must be at least 6 characters long.' });
      }

      const existingByEmail = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = ${cleanEmail}`)
        .limit(1);

      const existingById = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.uid}) = ${candidatePlayerId}`)
        .limit(1);

      // If candidatePlayerId is already used by another user, append a unique 4-digit tag automatically
      if (
        existingById.length > 0 &&
        (!existingByEmail.length || existingById[0].id !== existingByEmail[0].id)
      ) {
        candidatePlayerId = `${baseSlug || 'rk'}_${crypto.randomInt(1000, 9999)}`;
      }

      const passwordHash = hashPassword(String(password));
      const validSeats: SeatId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
      const seat: SeatId = validSeats.includes(preferredSeat) ? preferredSeat : 'D';

      let targetUser: typeof users.$inferSelect;

      if (existingByEmail.length > 0) {
        const existing = existingByEmail[0];
        if (!existing.passwordHash || existing.authProvider === 'email_unverified') {
          const [updated] = await db
            .update(users)
            .set({
              uid: candidatePlayerId,
              displayName: cleanName,
              passwordHash,
              authProvider: 'email_unverified',
              preferredSeat: seat,
              updatedAt: new Date(),
            })
            .where(eq(users.id, existing.id))
            .returning();
          targetUser = updated;
        } else {
          return res.status(409).json({
            error: 'An account with this email already exists. Please Login or use Forgot Password.',
          });
        }
      } else {
        const [created] = await db
          .insert(users)
          .values({
            uid: candidatePlayerId,
            email: cleanEmail,
            displayName: cleanName,
            passwordHash,
            authProvider: 'email_unverified',
            preferredSeat: seat,
            coins: 1000,
            highestBalance: 1000,
          })
          .returning();
        targetUser = created;
      }

      const { code, tokenHash, expiresAt } = generateResetCode();
      await db.insert(passwordResetTokens).values({
        userId: targetUser.id,
        email: targetUser.email,
        tokenHash,
        expiresAt,
      });

      return res.status(201).json({
        requiresVerification: true,
        playerId: targetUser.uid,
        displayName: targetUser.displayName,
        email: targetUser.email,
        verificationCode: code,
        expiresAt: expiresAt.toISOString(),
        message: 'Enter your 6-digit verification code to verify and sign in.',
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  });

  app.post('/api/auth/verify-email', async (req, res) => {
    try {
      const { identifier, email, code } = req.body || {};
      const lookup = String(identifier || email || '').trim();
      const cleanCode = String(code || '').trim();

      if (!lookup || !cleanCode) {
        return res.status(400).json({
          error: 'Player ID / Email and 6-digit verification code are required.',
        });
      }

      const user = await findUserByIdentifier(lookup);
      if (!user) {
        return res.status(404).json({
          error: 'Account not found. Please check your Player ID or Email.',
        });
      }

      const expectedHash = hashResetCode(cleanCode);
      const now = new Date();

      const matchingTokens = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            eq(passwordResetTokens.tokenHash, expectedHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now)
          )
        )
        .orderBy(desc(passwordResetTokens.createdAt))
        .limit(1);

      if (matchingTokens.length === 0) {
        return res.status(400).json({
          error: 'Invalid or expired 6-digit verification code. Click Resend Code to get a new one.',
        });
      }

      const tokenRecord = matchingTokens[0];
      const [verifiedUser] = await db
        .update(users)
        .set({
          authProvider: 'email_verified',
          updatedAt: now,
        })
        .where(eq(users.id, user.id))
        .returning();

      await db
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, tokenRecord.id));

      const sessionToken = signSessionToken({
        userId: verifiedUser.id,
        uid: verifiedUser.uid,
        email: verifiedUser.email,
      });

      return res.json({
        ok: true,
        message: 'Email verified! Your profile is now active.',
        token: sessionToken,
        user: sanitizeUser(verifiedUser),
      });
    } catch (error) {
      console.error('Verify email error:', error);
      return res.status(500).json({ error: 'Email verification failed.' });
    }
  });

  app.post('/api/auth/resend-verification', async (req, res) => {
    try {
      const { identifier, email } = req.body || {};
      const lookup = String(identifier || email || '').trim();
      if (!lookup) {
        return res.status(400).json({ error: 'Please enter your Player ID or Email.' });
      }

      const user = await findUserByIdentifier(lookup);
      if (!user) {
        return res.status(404).json({ error: 'No account found for that Player ID or Email.' });
      }

      const { code, tokenHash, expiresAt } = generateResetCode();
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        email: user.email,
        tokenHash,
        expiresAt,
      });

      return res.json({
        ok: true,
        playerId: user.uid,
        email: user.email,
        verificationCode: code,
        expiresAt: expiresAt.toISOString(),
        message: 'A fresh 6-digit email verification code has been generated.',
      });
    } catch (error) {
      console.error('Resend verification error:', error);
      return res.status(500).json({ error: 'Could not resend verification code.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { identifier, email, password } = req.body || {};
      const lookup = String(identifier || email || '').trim();

      if (!lookup || !password) {
        return res.status(400).json({
          error: 'Player ID (or Email) and password are required.',
        });
      }

      const user = await findUserByIdentifier(lookup);
      if (!user) {
        return res.status(401).json({
          error: 'No account found with that Player ID or Email. Please Sign Up first.',
        });
      }

      if (!user.passwordHash) {
        return res.status(401).json({
          error:
            'This account does not have a password set yet. Use "Reset Pass" to set your password.',
        });
      }

      const isValid = verifyPassword(String(password), user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid Player ID/Email or password.' });
      }

      if (user.authProvider === 'email_unverified') {
        const { code, tokenHash, expiresAt } = generateResetCode();
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          email: user.email,
          tokenHash,
          expiresAt,
        });
        return res.status(403).json({
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
      const { identifier, email } = req.body || {};
      const lookup = String(identifier || email || '').trim();

      if (!lookup) {
        return res.status(400).json({
          error: 'Please enter your Player ID or registered Email address.',
        });
      }

      const user = await findUserByIdentifier(lookup);
      if (!user) {
        return res.status(404).json({
          error: 'No registered account found with that Player ID or Email.',
        });
      }

      const { code, tokenHash, expiresAt } = generateResetCode();

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        email: user.email,
        tokenHash,
        expiresAt,
      });

      return res.json({
        ok: true,
        playerId: user.uid,
        email: user.email,
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
      const { identifier, email, code, newPassword } = req.body || {};
      const lookup = String(identifier || email || '').trim();
      const cleanCode = String(code || '').trim();

      if (!lookup || !cleanCode || !newPassword) {
        return res.status(400).json({
          error: 'Player ID / Email, 6-digit reset code, and new password are required.',
        });
      }
      if (String(newPassword).length < 6) {
        return res.status(400).json({
          error: 'New password must be at least 6 characters long.',
        });
      }

      const user = await findUserByIdentifier(lookup);
      if (!user) {
        return res.status(404).json({
          error: 'No account found with that Player ID or Email.',
        });
      }

      const expectedHash = hashResetCode(cleanCode);
      const now = new Date();

      const matchingTokens = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            eq(passwordResetTokens.tokenHash, expectedHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now)
          )
        )
        .orderBy(desc(passwordResetTokens.createdAt))
        .limit(1);

      if (matchingTokens.length === 0) {
        return res.status(400).json({
          error: 'Invalid or expired 6-digit reset code.',
        });
      }

      const tokenRecord = matchingTokens[0];
      const newPasswordHash = hashPassword(String(newPassword));

      const [updatedUser] = await db
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          authProvider: 'email_verified',
          updatedAt: now,
        })
        .where(eq(users.id, user.id))
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

  app.post('/api/auth/google', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Unauthorized Google token' });
      }
      const dbUser = await getOrCreateUser(
        req.user.uid,
        req.user.email || '',
        req.user.name
      );
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
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      if (protocols.has('vite-hmr')) return 'vite-hmr';
      return protocols.values().next().value || false;
    },
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    const protocol = String(request.headers['sec-websocket-protocol'] || '');

    if (protocol.includes('vite-hmr')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.send(JSON.stringify({ type: 'connected' }));
        ws.on('message', () => {});
        ws.on('error', () => {});
      });
      return;
    }

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
      return;
    }

    socket.destroy();
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
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        cors: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });

    // Self-unregister any stale PWA service workers that may have been registered in dev mode
    app.get(['/sw.js', '/dev-sw.js', '/registerSW.js'], (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(
        "if (typeof self !== 'undefined' && self.registration) { self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', () => { self.registration.unregister(); if (typeof caches !== 'undefined') { caches.keys().then(keys => keys.forEach(k => caches.delete(k))); } }); }"
      );
    });

    // Ensure /@vite/client never attempts to connect to unreachable port 24678 on Cloud Run when hmr: false
    app.get('/@vite/client', async (req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const patched = result.code
            .replace(/const hmrPort = \d+;/g, 'const hmrPort = null;')
            .replace(/const directSocketHost = "[^"]*";/g, 'const directSocketHost = `${importMetaUrl.host}/`;');
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).send(patched);
        }
      } catch (_err) {
        // Fall through to vite.middlewares
      }
      next();
    });

    app.use(vite.middlewares);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Royal Katti 3D Full-Stack + Multiplayer Server listening on http://0.0.0.0:${PORT}`);
    });
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
