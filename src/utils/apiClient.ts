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
        emailSent: false,
        message: 'Check your email inbox to verify your account and sign in.',
      },
      201
    );
  }

  if (path === '/api/auth/verify-email' && method === 'POST') {
    const lookup = String(body.identifier || body.email || '').trim();
    const code = String(body.code || '').trim();
    const firebaseIdToken = String(body.firebaseIdToken || '').trim();
    const acc = findAcc(lookup);
    if (!acc) {
      return jsonRes({ error: 'Account not found. Please register first.' }, 404);
    }
    if (!firebaseIdToken && acc.pendingCode && acc.pendingCode !== code) {
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
      emailSent: false,
    });
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const lookup = String(body.identifier || body.email || '').trim();
    const password = String(body.password || '');
    const firebaseIdToken = String(body.firebaseIdToken || '').trim();
    const firestoreProfile = body.firestoreProfile;
    let acc = findAcc(lookup);
    if (!acc && firebaseIdToken && lookup.includes('@')) {
      const cleanEmail = lookup.toLowerCase();
      const restoredId = String(
        firestoreProfile?.playerId ||
          `${cleanEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '').slice(0, 12) || 'player'}_${Math.floor(100 + Math.random() * 900)}`
      ).toLowerCase();
      acc = {
        id: accounts.length + 1,
        uid: restoredId,
        playerId: restoredId,
        email: cleanEmail,
        displayName: String(firestoreProfile?.displayName || restoredId).slice(0, 64),
        passwordHash: await hashPw(password),
        authProvider: 'email_verified',
        emailVerified: true,
        preferredSeat: firestoreProfile?.preferredSeat || 'D',
        coins: Number(firestoreProfile?.coins || 1000),
        highestBalance: Number(firestoreProfile?.highestBalance || 1000),
        totalWins: Number(firestoreProfile?.totalWins || 0),
        totalRounds: Number(firestoreProfile?.totalRounds || 0),
        hasPasswordHash: true,
        createdAt: new Date().toISOString(),
      };
      accounts.push(acc);
      saveAccounts(accounts);
    }
    if (!acc) {
      return jsonRes({ error: 'No account found with that Email or Player ID.' }, 401);
    }
    const pwHash = await hashPw(password);
    if (!firebaseIdToken && acc.passwordHash !== pwHash) {
      return jsonRes({ error: 'Incorrect password. Please try again.' }, 401);
    }
    if (firebaseIdToken) {
      acc.passwordHash = pwHash;
      acc.emailVerified = true;
      acc.authProvider = 'email_verified';
      delete acc.pendingCode;
      saveAccounts(accounts);
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
          emailSent: false,
          error: 'Please verify your email address to sign in.',
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
      emailSent: false,
    });
  }

  if (path === '/api/auth/reset-password' && method === 'POST') {
    const lookup = String(body.identifier || body.email || '').trim();
    const code = String(body.code || '').trim();
    const firebaseIdToken = String(body.firebaseIdToken || '').trim();
    const newPassword = String(body.newPassword || '');
    const acc = findAcc(lookup);
    if (!acc) return jsonRes({ error: 'Account not found.' }, 404);
    if (!firebaseIdToken && acc.pendingCode && acc.pendingCode !== code) {
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

  const ROOMS_STORAGE_KEY = 'royalkatti_rooms_v1';
  const INVITES_STORAGE_KEY = 'royalkatti_room_invites_v1';

  const loadLocalRooms = (): any[] => {
    try {
      const raw = localStorage.getItem(ROOMS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore
    }
    return [
      {
        roomCode: 'RK-ROYAL',
        roomName: 'Maharaja Royal Club',
        hostName: 'Maharaja Bot',
        dealerSeat: 'A',
        cutterSeat: 'B',
        phase: 'shuffling',
        playerCount: 1,
        maxPlayers: 6,
        occupiedSeats: { A: 'Maharaja Bot' },
        chat: [],
        isPublic: true,
      },
    ];
  };

  const saveLocalRooms = (list: any[]) => {
    try {
      localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
    } catch {
      // Ignore
    }
  };

  if (path.startsWith('/api/rooms/invites/dismiss') && method === 'POST') {
    try {
      const raw = localStorage.getItem(INVITES_STORAGE_KEY);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const found = list.find((i) => i.id === body.inviteId);
      if (found) found.dismissed = true;
      localStorage.setItem(INVITES_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignore
    }
    return jsonRes({ ok: true });
  }

  if (path.startsWith('/api/rooms/invites') && method === 'GET') {
    try {
      const raw = localStorage.getItem(INVITES_STORAGE_KEY);
      const list: any[] = raw ? JSON.parse(raw) : [];
      return jsonRes({ invites: list.filter((i) => !i.dismissed).slice(0, 10) });
    } catch {
      return jsonRes({ invites: [] });
    }
  }

  if (path === '/api/rooms/invite' && method === 'POST') {
    const roomCode = String(body.roomCode || '').trim().toUpperCase();
    const targetIdentifier = String(body.targetIdentifier || '').trim().toLowerCase();
    const invite = {
      id: `inv-${Date.now()}`,
      roomCode,
      roomName: String(body.roomName || `Table ${roomCode}`),
      fromPlayerName: String(body.fromPlayerName || 'Royal Host'),
      fromPlayerId: String(body.fromPlayerId || 'host'),
      targetIdentifier,
      createdAt: Date.now(),
      dismissed: false,
    };
    try {
      const raw = localStorage.getItem(INVITES_STORAGE_KEY);
      const list: any[] = raw ? JSON.parse(raw) : [];
      list.unshift(invite);
      localStorage.setItem(INVITES_STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
    } catch {
      // Ignore
    }
    return jsonRes(
      {
        ok: true,
        invite,
        message: `Invitation to room ${roomCode} sent to ${targetIdentifier}!`,
      },
      201
    );
  }

  if (path === '/api/rooms/join' && method === 'POST') {
    const rawCode = String(body.roomCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');
    if (!rawCode) return jsonRes({ error: 'Please enter a valid Room Code.' }, 400);
    const playerName = String(body.playerName || 'Royal Player').trim();
    const preferredSeat = ['A', 'B', 'C', 'D', 'E', 'F'].includes(body.seatId)
      ? body.seatId
      : 'D';

    const roomsList = loadLocalRooms();
    let room = roomsList.find((r) => r.roomCode === rawCode);
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
      roomsList.unshift(room);
    }
    if (!room.occupiedSeats) room.occupiedSeats = {};
    if (!room.chat) room.chat = [];

    for (const [sKey, occ] of Object.entries(room.occupiedSeats)) {
      if (occ === playerName && sKey !== preferredSeat) {
        delete room.occupiedSeats[sKey];
      }
    }
    room.occupiedSeats[preferredSeat] = playerName;
    room.playerCount = Math.max(1, Object.keys(room.occupiedSeats).length);
    room.chat.push({
      id: `join-${Date.now()}`,
      sender: playerName,
      seatId: preferredSeat,
      text: `Joined via Room Code ${rawCode} (Seat ${preferredSeat})`,
      timestamp: Date.now(),
    });
    saveLocalRooms(roomsList);
    return jsonRes({ room, assignedSeat: preferredSeat });
  }

  if (path === '/api/rooms/leave' && method === 'POST') {
    return jsonRes({ ok: true });
  }

  if (path === '/api/rooms/chat' && method === 'POST') {
    const rawCode = String(body.roomCode || '').trim().toUpperCase();
    const roomsList = loadLocalRooms();
    const room = roomsList.find((r) => r.roomCode === rawCode);
    const message = {
      id: `msg-${Date.now()}`,
      sender: String(body.sender || 'Player'),
      seatId: body.seatId || 'D',
      text: String(body.text || ''),
      timestamp: Date.now(),
    };
    if (room) {
      if (!room.chat) room.chat = [];
      room.chat.push(message);
      saveLocalRooms(roomsList);
    }
    return jsonRes({ ok: true, room, message });
  }

  if (path.startsWith('/api/rooms')) {
    const roomsList = loadLocalRooms();
    if (method === 'POST') {
      const rawCustom = String(body.customCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 12);
      const code =
        rawCustom && rawCustom.length >= 4
          ? rawCustom
          : `RK-${Math.floor(1000 + Math.random() * 9000)}`;
      const hostName = String(body.hostName || 'Royal Player').trim();
      const roomName = String(body.roomName || `${hostName}'s Table`).trim();
      const seat = body.preferredSeat || 'D';
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
      roomsList.unshift(newRoom);
      saveLocalRooms(roomsList);
      return jsonRes({ room: newRoom, assignedSeat: seat }, 201);
    }
    return jsonRes({ rooms: roomsList });
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
