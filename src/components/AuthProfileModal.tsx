import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  KeyRound,
  CheckCircle2,
  LogOut,
  Coins,
  Trophy,
  History,
  Copy,
  Check,
  ArrowLeft,
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

interface AuthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  token: string | null;
  onAuthSuccess: (token: string, user: UserProfile) => void;
  onLogout: () => void;
  onSelectSeat: (seat: SeatId) => void;
}

type MainTab = 'login' | 'register';
type ActiveScreen = 'login' | 'register' | 'verify' | 'forgot';

export const AuthProfileModal: React.FC<AuthProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  token,
  onAuthSuccess,
  onLogout,
  onSelectSeat,
}) => {
  const [mainTab, setMainTab] = useState<MainTab>('login');
  const [screen, setScreen] = useState<ActiveScreen>('login');

  // Form fields
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preferredSeat, setPreferredSeat] = useState<SeatId>('D');

  // Auto-generated Player ID suffix for Register preview
  const [randomSuffix] = useState(() => Math.floor(100 + Math.random() * 900));
  const previewPlayerId = useMemo(() => {
    const clean = (username || email.split('@')[0] || 'player')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 12);
    return `${clean || 'player'}_${randomSuffix}`;
  }, [username, email, randomSuffix]);

  // Verification step state
  const [assignedPlayerId, setAssignedPlayerId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [dispatchedCode, setDispatchedCode] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedProfileId, setCopiedProfileId] = useState(false);

  // Forgot password state
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [dispatchedResetCode, setDispatchedResetCode] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [sessions, setSessions] = useState<GameSessionRecord[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessMsg(null);

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

  const switchMainTab = (next: MainTab) => {
    setMainTab(next);
    setScreen(next);
    setError(null);
    setSuccessMsg(null);
  };

  // 1. Login Handler
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
          setAssignedPlayerId(data.playerId || '');
          setIdentifier(data.email || data.playerId || loginId);
          if (data.verificationCode) {
            setDispatchedCode(String(data.verificationCode));
            setVerifyCode(String(data.verificationCode));
          }
          if (data.verificationToken) {
            setVerificationToken(String(data.verificationToken));
          }
          setScreen('verify');
          setError(null);
          setSuccessMsg('Enter the 6-digit verification code below to complete sign in.');
        } else {
          setError(data.error || 'Invalid login credentials.');
        }
      } else {
        onAuthSuccess(data.token, data.user);
      }
    } catch {
      setError('Unable to sign in right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Register Handler -> Opens 6-Digit Verification Step
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
          playerId: previewPlayerId,
          displayName: username.trim() || previewPlayerId,
          email: email.trim(),
          password,
          preferredSeat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create account.');
      } else if (data.requiresVerification) {
        setAssignedPlayerId(data.playerId || previewPlayerId);
        setIdentifier(data.email || data.playerId || email.trim());
        if (data.verificationCode) {
          setDispatchedCode(String(data.verificationCode));
          setVerifyCode(String(data.verificationCode));
        }
        if (data.verificationToken) {
          setVerificationToken(String(data.verificationToken));
        }
        setScreen('verify');
        setSuccessMsg('Account created! Confirm your 6-digit code below to sign in.');
      } else if (data.token && data.user) {
        onAuthSuccess(data.token, data.user);
      }
    } catch {
      setError('Unable to register right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Verify 6-Digit Code Handler
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const lookup = identifier.trim() || email.trim() || assignedPlayerId;
      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: lookup,
          email: lookup,
          code: verifyCode.trim(),
          verificationToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid 6-digit verification code.');
      } else {
        setDispatchedCode(null);
        setVerifyCode('');
        onAuthSuccess(data.token, data.user);
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Resend 6-Digit Verification Code
  const handleResendCode = async () => {
    const lookup = identifier.trim() || email.trim() || assignedPlayerId;
    if (!lookup) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: lookup, email: lookup }),
      });
      const data = await res.json();
      if (res.ok && data.verificationCode) {
        setDispatchedCode(String(data.verificationCode));
        setVerifyCode(String(data.verificationCode));
        if (data.verificationToken) {
          setVerificationToken(String(data.verificationToken));
        }
        setSuccessMsg('New 6-digit verification code sent.');
      } else {
        setError(data.error || 'Could not resend code.');
      }
    } catch {
      setError('Could not resend code.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Forgot Password Request Code
  const handleRequestReset = async (e: React.FormEvent) => {
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
        setError(data.error || 'Account not found.');
      } else {
        setResetStep('confirm');
        if (data.previewResetCode) {
          setDispatchedResetCode(String(data.previewResetCode));
          setResetCode(String(data.previewResetCode));
        }
        if (data.resetToken) {
          setResetToken(String(data.resetToken));
        }
        setSuccessMsg('6-digit reset code generated. Enter your new password below.');
      }
    } catch {
      setError('Could not request password reset.');
    } finally {
      setLoading(false);
    }
  };

  // 6. Confirm Password Reset
  const handleConfirmReset = async (e: React.FormEvent) => {
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
          resetToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not reset password.');
      } else {
        setDispatchedResetCode(null);
        setResetStep('request');
        onAuthSuccess(data.token, data.user);
      }
    } catch {
      setError('Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  const ALL_SEATS: SeatId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

  const headerTitle = user
    ? 'Player Profile'
    : screen === 'verify'
    ? 'Verify Your Account'
    : screen === 'forgot'
    ? 'Reset Password'
    : mainTab === 'login'
    ? 'Welcome Back'
    : 'Create Account';

  const headerSubtitle = user
    ? `Player ID: ${user.playerId || user.uid}`
    : screen === 'verify'
    ? 'Confirm your 6-digit verification code'
    : screen === 'forgot'
    ? 'Recover access with a 6-digit code'
    : mainTab === 'login'
    ? 'Sign in with your Email or Player ID'
    : 'Get your unique Player ID & 1,000 RC stack';

  return (
    <div
      role="dialog"
      aria-label="Player Account"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/10 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.85)] text-slate-100 flex flex-col gap-4">
        {/* Clean Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white">
                {headerTitle}
              </h2>
              <p className="text-xs text-slate-400">{headerSubtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Modal"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-950/75 border border-rose-500/40 px-3.5 py-2.5 text-xs text-rose-200 font-medium">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl bg-emerald-950/75 border border-emerald-500/40 px-3.5 py-2.5 text-xs text-emerald-200 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* SIGNED-IN VIEW */}
        {user ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-lg flex items-center justify-center shrink-0">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white truncate">
                      {user.displayName}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Verified
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-amber-300 font-mono truncate">
                      ID: {user.playerId || user.uid}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(user.playerId || user.uid);
                        setCopiedProfileId(true);
                        setTimeout(() => setCopiedProfileId(false), 1500);
                      }}
                      className="text-slate-400 hover:text-white cursor-pointer"
                      title="Copy Player ID"
                    >
                      {copiedProfileId ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Balance</span>
                <span className="text-sm font-bold text-emerald-400 flex items-center justify-center gap-1 mt-1 tabular-nums">
                  <Coins className="w-3.5 h-3.5" />
                  {user.coins.toLocaleString()} RC
                </span>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Best Stack</span>
                <span className="text-sm font-bold text-amber-300 flex items-center justify-center gap-1 mt-1 tabular-nums">
                  <Trophy className="w-3.5 h-3.5" />
                  {user.highestBalance.toLocaleString()} RC
                </span>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Wins / Hands</span>
                <span className="text-sm font-bold text-sky-300 block mt-1 tabular-nums">
                  {user.totalWins} / {user.totalRounds}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300">
                Table Seat (A–F)
              </span>
              <div className="grid grid-cols-6 gap-1.5">
                {ALL_SEATS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSelectSeat(s)}
                    className={`py-2 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                      user.preferredSeat === s
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-slate-900/80 text-slate-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {sessions.length > 0 && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <span>Recent Hands</span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {sessions.slice(0, 5).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-xs bg-slate-900/60 border border-white/5 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-slate-300">
                        Hukam <b className="text-amber-300">{s.pointCard}</b> •{' '}
                        {s.winningSide === 'player' ? 'Bahar' : 'Andar'}
                      </span>
                      <span
                        className={`font-bold tabular-nums ${
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
          /* SIGNED-OUT VIEW: ONLY 2 TOP TABS (LOGIN & REGISTER) */
          <div className="flex flex-col gap-4">
            {(screen === 'login' || screen === 'register') && (
              <div className="grid grid-cols-2 gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => switchMainTab('login')}
                  className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    mainTab === 'login'
                      ? 'bg-amber-400 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => switchMainTab('register')}
                  className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    mainTab === 'register'
                      ? 'bg-amber-400 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Register
                </button>
              </div>
            )}

            {/* SCREEN 1: LOGIN */}
            {screen === 'login' && (
              <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Email or Player ID
                  </span>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Enter your Email or Player ID"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Password</span>
                    <button
                      type="button"
                      onClick={() => {
                        setScreen('forgot');
                        setResetStep('request');
                        setError(null);
                        setSuccessMsg(null);
                      }}
                      className="text-xs font-semibold text-amber-300 hover:text-amber-200 cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50 mt-1"
                >
                  {loading ? 'Signing In...' : 'Login'}
                </button>
              </form>
            )}

            {/* SCREEN 2: REGISTER */}
            {screen === 'register' && (
              <form onSubmit={handleRegister} className="flex flex-col gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      Username
                    </span>
                    <span className="text-[11px] font-mono text-amber-300/90">
                      Player ID: {previewPlayerId}
                    </span>
                  </div>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Your player name"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Email Address
                  </span>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Password
                  </span>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Starting Seat (1,000 RC Stack)
                  </span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {ALL_SEATS.map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setPreferredSeat(s)}
                        className={`py-2 rounded-lg font-bold text-xs border cursor-pointer transition-all ${
                          preferredSeat === s
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-slate-900 text-slate-300 border-white/10 hover:bg-white/5'
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
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50 mt-1"
                >
                  {loading ? 'Creating Account...' : 'Register'}
                </button>
              </form>
            )}

            {/* SCREEN 3: 6-DIGIT VERIFICATION STEP (SHOWN RIGHT AFTER REGISTER) */}
            {screen === 'verify' && (
              <form onSubmit={handleVerifyCode} className="flex flex-col gap-3.5">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Your Player ID:</span>
                    <span className="font-mono font-bold text-amber-300">
                      {assignedPlayerId || previewPlayerId}
                    </span>
                  </div>
                  {dispatchedCode && (
                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          6-Digit Verification Code
                        </span>
                        <span className="font-mono text-lg font-bold text-emerald-300 tracking-widest">
                          {dispatchedCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(dispatchedCode);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 1500);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Enter 6-Digit Code
                  </span>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="123456"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-400 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify & Sign In'}
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => switchMainTab('register')}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading}
                    className="text-xs font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Resend Code</span>
                  </button>
                </div>
              </form>
            )}

            {/* SCREEN 4: FORGOT PASSWORD (ACCESSED FROM LOGIN) */}
            {screen === 'forgot' && (
              <div className="flex flex-col gap-3.5">
                {resetStep === 'request' ? (
                  <form onSubmit={handleRequestReset} className="flex flex-col gap-3.5">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-300">
                        Email or Player ID
                      </span>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder="Enter your Email or Player ID"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                    >
                      {loading ? 'Sending Code...' : 'Get 6-Digit Reset Code'}
                    </button>

                    <button
                      type="button"
                      onClick={() => switchMainTab('login')}
                      className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 pt-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Login</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleConfirmReset} className="flex flex-col gap-3.5">
                    {dispatchedResetCode && (
                      <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-slate-400 block">
                            6-Digit Reset Code
                          </span>
                          <span className="font-mono text-lg font-bold text-amber-300 tracking-widest">
                            {dispatchedResetCode}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(dispatchedResetCode);
                            setCopiedCode(true);
                            setTimeout(() => setCopiedCode(false), 1500);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedCode ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-300">
                        6-Digit Reset Code
                      </span>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value)}
                          placeholder="123456"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-300">
                        New Password
                      </span>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-400 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                    >
                      {loading ? 'Updating Password...' : 'Update Password & Sign In'}
                    </button>

                    <button
                      type="button"
                      onClick={() => switchMainTab('login')}
                      className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 pt-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Login</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
