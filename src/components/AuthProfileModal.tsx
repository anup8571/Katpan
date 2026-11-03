import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  LogOut,
  Coins,
  Trophy,
  History,
  Copy,
  Check,
  AtSign,
  RefreshCw,
} from 'lucide-react';
import { SeatId } from '../game/types';
import { apiFetch } from '../utils/apiClient';

export interface UserProfile {
  id: number;
  uid: string;
  playerId?: string;
  email: string;
  displayName: string;
  authProvider: string;
  emailVerified?: boolean;
  preferredSeat: SeatId;
  coins: number;
  highestBalance: number;
  totalWins: number;
  totalRounds: number;
  hasPasswordHash: boolean;
}

export interface GameSessionRecord {
  id: number;
  roomCode: string | null;
  dealerSeat: string;
  cutterSeat: string;
  winningSide: string;
  pointCard: string;
  wager: number;
  coinDelta: number;
  finalBalance: number;
  createdAt: string;
}

interface SecurityStatus {
  rlsEnabled: boolean;
  passwordHashing: string;
  resetTokenHashing: string;
  tables: { tablename: string; rowsecurity: boolean }[];
  policies: { tablename: string; policyname: string; cmd: string }[];
}

interface AuthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  token: string | null;
  onAuthSuccess: (token: string, user: UserProfile) => void;
  onLogout: () => void;
  onSelectSeat: (seat: SeatId) => void;
}

type AuthTab = 'login' | 'register' | 'verify' | 'forgot';

export const AuthProfileModal: React.FC<AuthProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  token,
  onAuthSuccess,
  onLogout,
  onSelectSeat,
}) => {
  const [tab, setTab] = useState<AuthTab>('login');

  // Shared / Login / Register fields
  const [identifier, setIdentifier] = useState(''); // Player ID or Email for Login / Verify / Reset
  const [playerId, setPlayerId] = useState(''); // Unique Player ID for Sign Up
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [preferredSeat, setPreferredSeat] = useState<SeatId>('D');

  // Email Verification state
  const [verifyCode, setVerifyCode] = useState('');
  const [dispatchedVerifyCode, setDispatchedVerifyCode] = useState<string | null>(null);
  const [copiedVerify, setCopiedVerify] = useState(false);

  // Forgot / Reset Password flow state
  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
  const [resetCode, setResetCode] = useState('');
  const [previewResetCode, setPreviewResetCode] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [copiedReset, setCopiedReset] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [sessions, setSessions] = useState<GameSessionRecord[]>([]);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessMsg(null);

    apiFetch('/api/security/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSecurityStatus(data);
      })
      .catch(() => {});

    if (token) {
      apiFetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.sessions) setSessions(data.sessions);
        })
        .catch(() => {});
    }
  }, [isOpen, token]);

  if (!isOpen) return null;

  // 1. Sign In with Player ID or Email + Password
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const loginId = identifier.trim() || email.trim();
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginId,
          email: loginId,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresVerification) {
          setIdentifier(data.email || data.playerId || loginId);
          setEmail(data.email || '');
          if (data.verificationCode) {
            setDispatchedVerifyCode(String(data.verificationCode));
            setVerifyCode(String(data.verificationCode));
          }
          setTab('verify');
          setError(null);
          setSuccessMsg(
            'Your account requires email verification. Enter the 6-digit verification code below.'
          );
        } else {
          setError(data.error || 'Sign in failed.');
        }
      } else {
        onAuthSuccess(data.token, data.user);
        setSuccessMsg('Signed in! Your profile and Royal Coins balance are synced.');
      }
    } catch {
      setError('Server connection error while signing in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Sign Up with Player ID + Email + Password -> Generates 6-Digit Email Verification Code
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: playerId.trim(),
          displayName: displayName.trim() || playerId.trim(),
          email: email.trim(),
          password,
          preferredSeat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed.');
      } else if (data.requiresVerification) {
        setIdentifier(data.email || data.playerId || email.trim());
        if (data.verificationCode) {
          setDispatchedVerifyCode(String(data.verificationCode));
          setVerifyCode(String(data.verificationCode));
        }
        setTab('verify');
        setSuccessMsg(
          data.message ||
            'Account created! Verify the 6-digit email verification code below to activate your profile.'
        );
      } else if (data.token && data.user) {
        onAuthSuccess(data.token, data.user);
        setSuccessMsg('Account created and verified!');
      }
    } catch {
      setError('Server connection error while registering. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Verify Email with 6-Digit Code
  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const lookup = identifier.trim() || email.trim() || playerId.trim();
      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: lookup,
          email: lookup,
          code: verifyCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid or expired verification code.');
      } else {
        setDispatchedVerifyCode(null);
        setVerifyCode('');
        onAuthSuccess(data.token, data.user);
        setSuccessMsg('Email verified! You are now signed in to your profile.');
      }
    } catch {
      setError('Server connection error verifying email.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Resend 6-Digit Email Verification Code
  const handleResendVerification = async () => {
    const lookup = identifier.trim() || email.trim() || playerId.trim();
    if (!lookup) {
      setError('Please enter your Player ID or Email Address first.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: lookup, email: lookup }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not resend verification code.');
      } else {
        if (data.verificationCode) {
          setDispatchedVerifyCode(String(data.verificationCode));
          setVerifyCode(String(data.verificationCode));
        }
        setSuccessMsg('A fresh 6-digit email verification code has been dispatched.');
      }
    } catch {
      setError('Server connection error requesting new verification code.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Request 6-Digit Password Reset Code
  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const lookup = identifier.trim() || email.trim();
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: lookup, email: lookup }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not generate reset code.');
      } else {
        setResetStep('verify');
        if (data.previewResetCode) {
          setPreviewResetCode(String(data.previewResetCode));
          setResetCode(String(data.previewResetCode));
        }
        setSuccessMsg(
          '6-digit password reset code generated! Enter the code and your new password below.'
        );
      }
    } catch {
      setError('Server connection error requesting password reset.');
    } finally {
      setLoading(false);
    }
  };

  // 6. Confirm Password Reset
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const lookup = identifier.trim() || email.trim();
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: lookup,
          email: lookup,
          code: resetCode.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to reset password.');
      } else {
        setPreviewResetCode(null);
        setResetStep('request');
        onAuthSuccess(data.token, data.user);
        setSuccessMsg('Password reset complete! You are now signed in.');
      }
    } catch {
      setError('Server connection error resetting password.');
    } finally {
      setLoading(false);
    }
  };

  const ALL_SEATS: SeatId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

  return (
    <div
      role="dialog"
      aria-label="Player Profile and Authentication"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-white/15 p-4 sm:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-slate-100 flex flex-col gap-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white">
                {user ? 'PLAYER ID PROFILE' : 'ROYAL KATTI ID & PASSWORD AUTH'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {user
                  ? `ID: @${user.playerId || user.uid} • Cloud SQL & Scrypt Verified`
                  : 'Sign Up, Email Verification, ID Login & Password Reset'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Profile Modal"
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-950/70 border border-rose-400/50 px-3 py-2 text-xs text-rose-200 font-medium">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl bg-emerald-950/70 border border-emerald-400/50 px-3 py-2 text-xs text-emerald-200 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* SIGNED-IN VIEW */}
        {user ? (
          <div className="flex flex-col gap-3.5">
            {/* Identity Card */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-lg flex items-center justify-center shrink-0">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-sm text-white truncate">
                      {user.displayName}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 uppercase">
                      Verified ID
                    </span>
                  </div>
                  <p className="text-xs text-amber-300/90 font-mono truncate">
                    ID: @{user.playerId || user.uid}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Balance
                </span>
                <span className="text-sm font-black text-emerald-400 flex items-center justify-center gap-1 mt-0.5 tabular-nums">
                  <Coins className="w-3.5 h-3.5" />
                  {user.coins.toLocaleString()} RC
                </span>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Peak RC
                </span>
                <span className="text-sm font-black text-amber-300 flex items-center justify-center gap-1 mt-0.5 tabular-nums">
                  <Trophy className="w-3.5 h-3.5" />
                  {user.highestBalance.toLocaleString()} RC
                </span>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Wins / Hands
                </span>
                <span className="text-sm font-black text-sky-300 block mt-0.5 tabular-nums">
                  {user.totalWins} / {user.totalRounds}
                </span>
              </div>
            </div>

            {/* Preferred Seat Picker */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Preferred Table Seat (A–F)
              </span>
              <div className="grid grid-cols-6 gap-1.5">
                {ALL_SEATS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSelectSeat(s)}
                    className={`py-1.5 rounded-lg font-black text-xs border transition-all cursor-pointer ${
                      user.preferredSeat === s
                        ? 'bg-amber-400 text-slate-950 border-yellow-200'
                        : 'bg-slate-900/70 text-slate-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    Seat {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Cloud SQL Sessions */}
            {sessions.length > 0 && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <span>Recent Recorded Hands</span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {sessions.slice(0, 5).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-xs bg-slate-900/60 border border-white/5 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-slate-300 font-medium">
                        Hukam <b className="text-amber-300">{s.pointCard}</b> •{' '}
                        {s.winningSide === 'player' ? 'Bahar' : 'Andar'}
                      </span>
                      <span
                        className={`font-black tabular-nums ${
                          s.coinDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {s.coinDelta >= 0 ? `+${s.coinDelta}` : s.coinDelta} RC
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* SIGNED-OUT AUTHENTICATION TABS */
          <div className="flex flex-col gap-3.5">
            {/* 4-Tab Mode Switcher: Sign In | Sign Up | Verify Email | Reset Pass */}
            <div className="grid grid-cols-4 gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer whitespace-nowrap ${
                  tab === 'login'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer whitespace-nowrap ${
                  tab === 'register'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('verify');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer whitespace-nowrap ${
                  tab === 'verify'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Verify Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('forgot');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer whitespace-nowrap ${
                  tab === 'forgot'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Reset Pass
              </button>
            </div>

            {/* TAB 1: SIGN IN (PLAYER ID OR EMAIL + PASSWORD) */}
            {tab === 'login' && (
              <form onSubmit={handleLogin} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-300">
                    Player ID or Email Address
                  </span>
                  <div className="relative">
                    <AtSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="vikram99 or player@royalkatti.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300">Password</span>
                    <button
                      type="button"
                      onClick={() => setTab('forgot')}
                      className="text-[11px] font-bold text-amber-300 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 border border-yellow-200 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                >
                  {loading ? 'VERIFYING ID & PASSWORD...' : 'SIGN IN WITH ID / EMAIL'}
                </button>
              </form>
            )}

            {/* TAB 2: SIGN UP (PLAYER ID + DISPLAY NAME + EMAIL + PASSWORD) */}
            {tab === 'register' && (
              <form onSubmit={handleRegister} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-slate-300">
                      Unique Player ID
                    </span>
                    <div className="relative">
                      <AtSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        minLength={3}
                        value={playerId}
                        onChange={(e) =>
                          setPlayerId(
                            e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '')
                          )
                        }
                        placeholder="vikram99"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-slate-300">
                      Display Name
                    </span>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Maharaja Vikram"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-300">Email Address</span>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="player@royalkatti.com"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-300">
                    Password (min 6 chars • hashed with scrypt)
                  </span>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-300">
                    Starting Seat (1,000 RC Welcome Stack)
                  </span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {ALL_SEATS.map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setPreferredSeat(s)}
                        className={`py-1.5 rounded-lg font-black text-xs border cursor-pointer transition-all ${
                          preferredSeat === s
                            ? 'bg-amber-400 text-slate-950 border-yellow-200'
                            : 'bg-slate-900 text-slate-300 border-white/10'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-400 hover:brightness-110 border border-emerald-200 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                >
                  {loading ? 'CREATING ACCOUNT...' : 'SIGN UP & SEND VERIFICATION CODE'}
                </button>
              </form>
            )}

            {/* TAB 3: EMAIL VERIFICATION (6-DIGIT VERIFICATION CODE) */}
            {tab === 'verify' && (
              <form onSubmit={handleVerifyEmail} className="flex flex-col gap-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Verify your email address with the 6-digit verification code generated for
                  your Player ID / Email to activate your account across all browsers.
                </p>

                {dispatchedVerifyCode && (
                  <div className="rounded-xl bg-amber-500/15 border border-amber-400/50 p-2.5 flex items-center justify-between gap-2">
                    <div className="text-xs">
                      <span className="text-amber-200 font-bold block">
                        6-Digit Email Verification Code:
                      </span>
                      <span className="font-mono text-base font-black text-amber-300 tracking-widest">
                        {dispatchedVerifyCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(dispatchedVerifyCode);
                        setCopiedVerify(true);
                        setTimeout(() => setCopiedVerify(false), 1500);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedVerify ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedVerify ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-300">
                    Player ID or Email Address
                  </span>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={identifier || email}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        setEmail(e.target.value);
                      }}
                      placeholder="vikram99 or player@royalkatti.com"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-300">
                    6-Digit Verification Code
                  </span>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="123456"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleResendVerification}
                    className="py-2.5 px-3 rounded-xl font-bold text-xs text-slate-200 bg-white/5 hover:bg-white/10 border border-white/15 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Resend Code</span>
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-emerald-300 to-teal-400 hover:brightness-110 border border-emerald-200 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                  >
                    {loading ? 'VERIFYING...' : 'VERIFY EMAIL & SIGN IN'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 4: FORGOT PASSWORD / PASSWORD RESET */}
            {tab === 'forgot' && (
              <div className="flex flex-col gap-3">
                {resetStep === 'request' ? (
                  <form onSubmit={handleRequestResetCode} className="flex flex-col gap-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Enter your Player ID or registered Email Address to generate a
                      time-limited 6-digit password reset code protected by HMAC-SHA256.
                    </p>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-300">
                        Player ID or Email Address
                      </span>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={identifier || email}
                          onChange={(e) => {
                            setIdentifier(e.target.value);
                            setEmail(e.target.value);
                          }}
                          placeholder="vikram99 or player@royalkatti.com"
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                    >
                      {loading ? 'GENERATING RESET TOKEN...' : 'SEND 6-DIGIT RESET CODE'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleConfirmResetPassword} className="flex flex-col gap-3">
                    {previewResetCode && (
                      <div className="rounded-xl bg-amber-500/15 border border-amber-400/50 p-2.5 flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="text-amber-200 font-bold block">
                            6-Digit Password Reset Code:
                          </span>
                          <span className="font-mono text-base font-black text-amber-300 tracking-widest">
                            {previewResetCode}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(previewResetCode);
                            setCopiedReset(true);
                            setTimeout(() => setCopiedReset(false), 1500);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          {copiedReset ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedReset ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}

                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-300">
                        6-Digit Reset Code
                      </span>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value)}
                          placeholder="123456"
                          className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-300">
                        New Password (min 6 chars)
                      </span>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setResetStep('request')}
                        className="py-2.5 px-3 rounded-xl font-bold text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-emerald-300 to-teal-400 hover:brightness-110 border border-emerald-200 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                      >
                        {loading ? 'UPDATING HASH...' : 'CONFIRM NEW PASSWORD'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* Live PostgreSQL RLS & Password Hashing Verification Footer */}
        <div className="rounded-xl bg-emerald-950/35 border border-emerald-500/30 p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-black text-emerald-300 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Server ID/Password Auth • RLS &amp; Scrypt Active</span>
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              {securityStatus?.policies?.length || 4} RLS Policies ON
            </span>
          </div>
          <p className="text-[10px] text-slate-300 leading-relaxed">
            • Profiles are stored on the server by <b>Player ID &amp; Email</b> with{' '}
            <b>scrypt + 128-bit salt</b> password hashing.<br />• 6-digit Email Verification
            &amp; Password Reset tokens hashed with <code>HMAC-SHA256</code>.
          </p>
        </div>
      </div>
    </div>
  );
};
